// Regenerates the level pack in src/levels/pack.
//
//   npm run levels                  all 120 levels
//   npm run levels -- --sections 2,5  only those sections (1-based); other levels are kept
//   npm run levels -- --workers 2   limit parallel workers (default: CPU count)
//
// Output is deterministic: each level uses fixed seeds, so the same code makes the same pack.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork, type ChildProcess } from 'node:child_process';
import { createRng, generateLevel, pathKeys, type LevelDef } from '../src/core';
import { SECTIONS, planLevel } from './pack-plan';

const PACK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src/levels/pack');
const SEEDS_PER_LEVEL = 6;

interface Task {
  level: number;
  seed: number;
}
interface Result extends Task {
  def: LevelDef | null;
  stats: Record<string, number>;
  ms: number;
}

const fileName = (level: number) => `${String(level).padStart(3, '0')}.json`;

if (process.argv.includes('--worker')) {
  // Worker process: generate one level per message.
  process.on('message', (task: Task) => {
    const started = Date.now();
    const stats: Record<string, number> = {};
    const generated = generateLevel(planLevel(task.level).settings, {
      rng: createRng(task.seed),
      maxAttempts: 250,
      stats,
    });
    const result: Result = { ...task, def: generated?.def ?? null, stats, ms: Date.now() - started };
    process.send?.(result);
  });
} else {
  await main();
}

function parseArgs() {
  const args = process.argv.slice(2);
  const value = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const sections = value('--sections')
    ?.split(',')
    .map((s) => SECTIONS[Number(s) - 1])
    .filter((s) => s !== undefined) ?? SECTIONS;
  const workers = Number(value('--workers') ?? availableParallelism());
  return { sections, workers: Math.max(1, workers) };
}

/** Runs tasks on a pool of workers, returning results in task order. */
async function runAll(tasks: Task[], workerCount: number, onResult: (r: Result) => void): Promise<Result[]> {
  const results = new Map<Task, Result>();
  let next = 0;
  const workers: ChildProcess[] = Array.from({ length: Math.min(workerCount, tasks.length) }, () =>
    fork(fileURLToPath(import.meta.url), ['--worker'], { execArgv: ['--import', 'tsx'] }),
  );
  await Promise.all(
    workers.map(
      (worker) =>
        new Promise<void>((resolve, reject) => {
          const feed = () => {
            const task = tasks[next++];
            if (task) worker.send(task);
            else resolve();
          };
          worker.on('message', (message) => {
            const r = message as Result;
            const task = tasks.find((t) => t.level === r.level && t.seed === r.seed);
            if (task) results.set(task, r);
            onResult(r);
            feed();
          });
          worker.on('error', reject);
          feed();
        }),
    ),
  );
  for (const w of workers) w.kill();
  return tasks.map((t) => results.get(t) as Result);
}

async function main() {
  const { sections, workers } = parseArgs();
  const levels = sections.flatMap((s) => Array.from({ length: s.last - s.first + 1 }, (_, i) => s.first + i));
  const remaking = new Set(levels);
  mkdirSync(PACK_DIR, { recursive: true });

  // Levels we keep still count for duplicate checks.
  const seen = new Set<string>();
  for (const file of readdirSync(PACK_DIR).filter((f) => f.endsWith('.json'))) {
    if (remaking.has(Number(file.slice(0, 3)))) continue;
    for (const key of pathKeys(JSON.parse(readFileSync(join(PACK_DIR, file), 'utf8')) as LevelDef)) seen.add(key);
  }

  console.log(`Generating ${levels.length} levels on ${workers} workers...`);
  const started = Date.now();
  const made = new Map<number, LevelDef>();
  const totals: Record<string, number> = {};
  let pending = levels.map((level) => ({ level, seed: level * 1000 }));

  // Each round generates every missing level, then accepts results in level order so
  // duplicate checks don't depend on which worker finished first. Failures and duplicates
  // go round again with the next seed.
  while (pending.length) {
    const results = await runAll(pending, workers, (r) => {
      const note = r.def ? `par ${r.def.par}` : 'failed';
      console.log(`  level ${String(r.level).padStart(3)} seed ${r.seed}: ${note} (${(r.ms / 1000).toFixed(1)}s)`);
    });
    const retry: Task[] = [];
    for (const r of results) {
      for (const [k, v] of Object.entries(r.stats)) totals[k] = (totals[k] ?? 0) + v;
      const keys = r.def ? pathKeys(r.def) : [];
      if (r.def && !keys.some((k) => seen.has(k))) {
        keys.forEach((k) => seen.add(k));
        made.set(r.level, r.def);
        continue;
      }
      if (r.def) totals['duplicate'] = (totals['duplicate'] ?? 0) + 1;
      if (r.seed - r.level * 1000 + 1 >= SEEDS_PER_LEVEL) throw new Error(`level ${r.level}: no level after ${SEEDS_PER_LEVEL} seeds`);
      retry.push({ level: r.level, seed: r.seed + 1 });
    }
    pending = retry;
  }

  // Within a section, order by par and then difficulty score so the curve only goes up.
  for (const section of sections) {
    const defs = levels.filter((l) => l >= section.first && l <= section.last).map((l) => made.get(l) as LevelDef);
    defs.sort((a, b) => (a.par ?? 0) - (b.par ?? 0) || (a.difficulty ?? 0) - (b.difficulty ?? 0));
    defs.forEach((def, i) => {
      const level = section.first + i;
      writeFileSync(join(PACK_DIR, fileName(level)), `${JSON.stringify(tidy(def, level), null, 2)}\n`);
    });
  }

  console.log('\nLevel  par  difficulty  floors  vehicles  cranes');
  for (const file of readdirSync(PACK_DIR).filter((f) => f.endsWith('.json')).sort()) {
    const def = JSON.parse(readFileSync(join(PACK_DIR, file), 'utf8')) as LevelDef;
    console.log(
      `${def.id.padStart(5)}  ${String(def.par).padStart(3)}  ${String(def.difficulty).padStart(10)}  ` +
        `${String(def.floors.length).padStart(6)}  ${String(def.vehicles.length).padStart(8)}  ${def.cranes ?? 0}`,
    );
  }
  console.log(`\nRejected along the way: ${JSON.stringify(totals)}`);
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(0)}s.`);
}

/** Fixed key order and level id/name, so files diff cleanly. */
function tidy(def: LevelDef, level: number): LevelDef {
  const out: LevelDef = {
    id: String(level).padStart(3, '0'),
    name: `Level ${level}`,
    par: def.par,
    difficulty: def.difficulty,
    floors: def.floors,
    exit: def.exit,
    vehicles: def.vehicles,
  };
  if (def.ramps) out.ramps = def.ramps;
  if (def.cranes) out.cranes = def.cranes;
  out.solution = def.solution;
  return out;
}
