import { describe, expect, it } from 'vitest';
import {
  canonicalKey,
  compileLevel,
  createRng,
  distancesToGoal,
  exploreStates,
  featuresUsed,
  generateLevel,
  independentMoves,
  randomLayout,
  solve,
  stateKey,
  type GeneratorSettings,
  type LevelDef,
} from '../../src/core';
import { classic3, oneMove, rampLevel } from './fixtures';

describe('random numbers', () => {
  it('repeat for the same seed', () => {
    const a = createRng(7);
    const b = createRng(7);
    const c = createRng(8);
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    expect([c(), c(), c()]).not.toEqual(seqA);
    for (const n of seqA) expect(n >= 0 && n < 1).toBe(true);
  });
});

describe('state graph', () => {
  it('measures the distance to a win from every position', () => {
    const level = compileLevel(classic3);
    const graph = exploreStates(level, level.initial, 100_000);
    expect(graph.truncated).toBe(false);
    const dist = distancesToGoal(level, graph);
    expect(dist[0]).toBe(3);
    // Spot-check against the solver.
    for (const i of [1, 5, 17, graph.states.length - 1]) {
      const d = dist[i]!;
      const result = solve(level, graph.states[i]);
      expect(result.par).toBe(d);
    }
  });

  it('flags a capped exploration as truncated', () => {
    const level = compileLevel(classic3);
    expect(exploreStates(level, level.initial, 5).truncated).toBe(true);
  });
});

describe('canonical keys', () => {
  it('ignore ids, truck vs bus and mirror images', () => {
    const renamed: LevelDef = {
      ...classic3,
      id: 'other',
      vehicles: classic3.vehicles.map((v) => ({
        ...v,
        id: `${v.id}2`,
        kind: v.kind === 'truck' ? 'bus' : v.kind,
      })),
    };
    expect(canonicalKey(renamed)).toBe(canonicalKey(classic3));

    // Mirror left-right: x -> width - x - length for horizontal vehicles.
    const mirrored: LevelDef = {
      ...classic3,
      exit: { floor: 0, x: 0, y: 2, dir: 'left' },
      vehicles: [
        { id: 'P', kind: 'player', floor: 0, x: 4, y: 2, facing: 'left' },
        { id: 'A', kind: 'car', floor: 0, x: 2, y: 1, facing: 'up' },
        { id: 'T', kind: 'truck', floor: 0, x: 2, y: 3, facing: 'down' },
        { id: 'B', kind: 'car', floor: 0, x: 2, y: 0, facing: 'left' },
      ],
    };
    expect(canonicalKey(mirrored)).toBe(canonicalKey(classic3));
  });

  it('differ when a vehicle moves', () => {
    const moved = structuredClone(classic3);
    moved.vehicles[3]!.x = 0;
    expect(canonicalKey(moved)).not.toBe(canonicalKey(classic3));
  });
});

describe('random layouts', () => {
  it('are valid levels with the player one step from the exit', () => {
    const rng = createRng(1);
    for (const floors of [1, 2, 3]) {
      const def = randomLayout({ floors, vehicles: { car: 8, truck: 2, motorcycle: 2, tow: 1 }, walls: 1, targetPar: 5 }, rng);
      const level = compileLevel(def);
      expect(def.floors).toHaveLength(floors);
      expect(def.ramps ?? []).toHaveLength(floors - 1);
      expect(solve(level).par).toBe(1);
    }
  });
});

describe('generator', () => {
  const settings: GeneratorSettings = { floors: 1, vehicles: { car: 9 }, targetPar: 6 };

  it('makes a level at the target par that the solver agrees with', () => {
    const made = generateLevel(settings, { rng: createRng(3), id: 'g1' });
    expect(made).not.toBeNull();
    const def = made!.def;
    expect(def.id).toBe('g1');
    expect(def.par).toBe(6);
    const result = solve(compileLevel(def));
    expect(result.par).toBe(def.par);
    expect(def.solution).toHaveLength(6);
    expect(def.difficulty).toBeGreaterThan(6);
  });

  it('is reproducible from a seed', () => {
    const a = generateLevel(settings, { rng: createRng(11) });
    const b = generateLevel(settings, { rng: createRng(11) });
    expect(a?.def).toEqual(b?.def);
  });

  it('rejects duplicates of levels already made', () => {
    const seen = new Set<string>();
    const first = generateLevel(settings, { rng: createRng(5), seen });
    const again = generateLevel(settings, { rng: createRng(5), seen });
    expect(first && again).toBeTruthy();
    expect(canonicalKey(again!.def)).not.toBe(canonicalKey(first!.def));
    expect(seen.has(canonicalKey(first!.def))).toBe(true);
  });

  it('rejects trivial levels', () => {
    const made = generateLevel({ floors: 1, vehicles: { car: 4 }, targetPar: 1 }, { rng: createRng(2) });
    // A target below the minimum is raised to it.
    expect(made?.par).toBe(2);
    // Sweeps (most moves playable straight away) don't count either.
    const stats: Record<string, number> = {};
    for (const seed of [1, 2]) {
      const level = generateLevel({ ...settings, targetPar: 7 }, { rng: createRng(seed), stats });
      expect(level).not.toBeNull();
      expect(independentMoves(compileLevel(level!.def), level!.def.solution) * 2).toBeLessThanOrEqual(7);
    }
  }, 60_000);

  it('uses the ramp on multi-floor levels', () => {
    const made = generateLevel(
      { floors: 2, vehicles: { car: 30 }, walls: 1, targetPar: 4, parTolerance: 1, playerUpstairs: true },
      { rng: createRng(4) },
    );
    expect(made).not.toBeNull();
    const level = compileLevel(made!.def);
    expect(featuresUsed(level, made!.def.solution).has('ramp')).toBe(true);
    expect(level.initial.vehicles[level.playerIndex]!.floor).toBe(1);
  }, 60_000);

  it('makes crane levels where the crane is needed', () => {
    const made = generateLevel({ floors: 1, vehicles: { car: 9 }, cranes: 1, targetPar: 4, parTolerance: 1 }, { rng: createRng(6) });
    expect(made).not.toBeNull();
    const def = made!.def;
    expect(def.cranes).toBe(1);
    expect(featuresUsed(compileLevel(def), def.solution).has('crane')).toBe(true);
    const without = solve(compileLevel({ ...def, cranes: 0 }));
    if (without.solvable) expect(without.par).toBeGreaterThan(def.par!);
  }, 60_000);

  it('reports features used by a solution', () => {
    const ramp = compileLevel(rampLevel);
    expect(featuresUsed(ramp, solve(ramp).moves).has('ramp')).toBe(true);
    const flat = compileLevel(oneMove);
    expect(featuresUsed(flat, solve(flat).moves).size).toBe(0);
  });
});

describe('state keys', () => {
  it('tell apart positions that differ only in facing', () => {
    const level = compileLevel(rampLevel);
    const s = level.initial;
    const flipped = { ...s, vehicles: s.vehicles.map((v, i) => (i === 0 ? { ...v, facing: 'right' as const } : v)) };
    expect(stateKey(flipped)).not.toBe(stateKey(s));
  });
});
