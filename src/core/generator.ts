import { axisOf, opposite, type Dir } from './geometry';
import { compileLevel, LevelError, type Level } from './level';
import { applyMove, successors } from './moves';
import { createRng, pick, randInt, shuffle, type Rng } from './random';
import { solve } from './solver';
import { isSolved, stateKey } from './state';
import {
  VEHICLE_LENGTH,
  type EdgeRef,
  type GameState,
  type LevelDef,
  type RampDef,
  type VehicleDef,
  type VehicleKind,
} from './types';

/** Something the optimal solution must use for the level to count. */
export type Feature = 'ramp' | 'tow' | 'crane';

export type BlockerKind = Exclude<VehicleKind, 'player'>;

export interface GeneratorSettings {
  /** Number of floors (1 or more). Floors above the ground are linked by a chain of ramps. */
  floors: number;
  /** Floor size, default 6x6. */
  width?: number;
  height?: number;
  /** How many of each vehicle to place, spread over all floors. Any that don't fit are left out. */
  vehicles: Partial<Record<BlockerKind, number>>;
  /** Random pillars per floor. */
  walls?: number;
  /** Crane power-ups. When set, the crane must make the level shorter or possible at all. */
  cranes?: number;
  /** Wanted par. */
  targetPar: number;
  /** Accept par within targetPar ± this (default 0). */
  parTolerance?: number;
  /** Anything below this is trivial and rejected (default 2). */
  minPar?: number;
  /** Features the shipped solution must use. Multi-floor levels always require 'ramp'. */
  require?: Feature[];
  /**
   * How many floors, from the ground up, start with the player's lane clear (default: all).
   * The player can only reach those floors; floors above are packed and serve as places to
   * move blockers to through the ramps, which keeps the number of positions down.
   */
  routeFloors?: number;
  /** Only start the player on an upper floor (multi-floor levels). */
  playerUpstairs?: boolean;
  /**
   * Multi-floor only: cap on the product of each floor's own position count (moves that
   * stay on that floor). Floors multiply each other's positions, so loose floors make a
   * level too big to explore or solve. Default 20 000.
   */
  floorProductLimit?: number;
  /** States to explore per random layout (default 40 000). Past this, distances are estimates. */
  exploreLimit?: number;
  /**
   * The solver may visit at most this many states to prove a level (default 150 000).
   * Keeps every shipped level quick to verify and to compute hints for.
   */
  solveLimit?: number;
}

export interface GenerateOptions {
  /** Random source; use a seeded one for reproducible packs. */
  rng?: Rng;
  /** Canonical keys of levels already made. Checked and updated, so pass the same set for a whole pack. */
  seen?: Set<string>;
  /** Counts why layouts and picks were rejected, keyed by reason. Added to, not reset. */
  stats?: Record<string, number>;
  /** Layouts to try before giving up (default 500). */
  maxAttempts?: number;
  id?: string;
  name?: string;
}

export interface GeneratedLevel {
  def: LevelDef;
  par: number;
  difficulty: number;
  /** Layouts tried, including the one that worked. */
  attempts: number;
}

const DEFAULT_SIZE = 6;
const DEFAULT_FLOOR_PRODUCT = 20_000;
const VEHICLE_IDS = 'ABCDFGHIJKLMNOQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// ---------------------------------------------------------------------------
// State graph

/** States reachable from a start, with their outgoing moves as indices. */
export interface StateGraph {
  states: GameState[];
  /** Successors of state i are edges[edgeStart[i] .. edgeStart[i + 1]). */
  edgeStart: Int32Array;
  edges: Int32Array;
  /**
   * True if the cap was hit. The graph then holds only the first `maxStates` states and
   * the moves between them, so distances measured in it are upper bounds, not exact.
   */
  truncated: boolean;
}

/** Breadth-first walk of the states reachable from `start`, up to `maxStates` of them. */
export function exploreStates(level: Level, start: GameState, maxStates: number): StateGraph {
  const states: GameState[] = [start];
  const index = new Map<string, number>([[stateKey(start), 0]]);
  const edgeStart: number[] = [];
  const edges: number[] = [];
  let truncated = false;
  for (let head = 0; head < states.length; head++) {
    const state = states[head] as GameState;
    edgeStart.push(edges.length);
    for (const next of successors(level, state)) {
      const key = stateKey(next.state);
      let id = index.get(key);
      if (id === undefined) {
        if (states.length >= maxStates) {
          truncated = true;
          continue;
        }
        id = states.length;
        index.set(key, id);
        states.push(next.state);
      }
      edges.push(id);
    }
  }
  edgeStart.push(edges.length);
  return { states, edgeStart: Int32Array.from(edgeStart), edges: Int32Array.from(edges), truncated };
}

/** How many positions floor `floor` has on its own, counting only moves that stay on it. */
export function floorStateCount(level: Level, floor: number, limit: number): number {
  const onFloor = (st: GameState, i: number) => st.vehicles[i]?.floor === floor;
  const seen = new Set<string>([stateKey(level.initial)]);
  const queue = [level.initial];
  for (let head = 0; head < queue.length && seen.size <= limit; head++) {
    const state = queue[head] as GameState;
    for (const next of successors(level, state)) {
      const i = level.ids.indexOf(next.move.vehicle);
      if (!onFloor(state, i) || !onFloor(next.state, i)) continue;
      const key = stateKey(next.state);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(next.state);
    }
  }
  return seen.size;
}

/**
 * Minimum moves from every state in the graph to a solved state (-1 = none found).
 * Runs a backwards breadth-first search from all solved states at once. Exact for a
 * complete graph; an upper bound for a truncated one.
 */
export function distancesToGoal(level: Level, graph: StateGraph): Int32Array {
  const n = graph.states.length;
  const { edgeStart, edges } = graph;

  // Reverse the edges into the same compact layout.
  const revStart = new Int32Array(n + 1);
  for (const to of edges) revStart[to + 1] = revStart[to + 1]! + 1;
  for (let i = 0; i < n; i++) revStart[i + 1] = revStart[i + 1]! + revStart[i]!;
  const fill = revStart.slice(0, n);
  const rev = new Int32Array(edges.length);
  for (let from = 0; from < n; from++) {
    for (let e = edgeStart[from]!; e < edgeStart[from + 1]!; e++) {
      const to = edges[e]!;
      rev[fill[to]!] = from;
      fill[to] = fill[to]! + 1;
    }
  }

  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let tail = 0;
  graph.states.forEach((s, i) => {
    if (isSolved(level, s)) {
      dist[i] = 0;
      queue[tail++] = i;
    }
  });
  for (let head = 0; head < tail; head++) {
    const at = queue[head]!;
    for (let e = revStart[at]!; e < revStart[at + 1]!; e++) {
      const from = rev[e]!;
      if (dist[from] === -1) {
        dist[from] = dist[at]! + 1;
        queue[tail++] = from;
      }
    }
  }
  return dist;
}

// ---------------------------------------------------------------------------
// Canonical keys (duplicate detection)

const KIND_CLASS: Record<VehicleKind, string> = {
  player: 'P',
  car: 'c',
  motorcycle: 'm',
  // Trucks and buses play identically.
  truck: 't',
  bus: 't',
  tow: 'w',
};

function flipDir(dir: Dir, fx: boolean, fy: boolean): Dir {
  if (fx && axisOf(dir) === 'h') return opposite(dir);
  if (fy && axisOf(dir) === 'v') return opposite(dir);
  return dir;
}

function serialize(def: LevelDef, fx: boolean, fy: boolean): string {
  const w = (f: number) => def.floors[f]?.width ?? 0;
  const h = (f: number) => def.floors[f]?.height ?? 0;
  const cx = (f: number, x: number, len = 1) => (fx ? w(f) - x - len : x);
  const cy = (f: number, y: number, len = 1) => (fy ? h(f) - y - len : y);
  const edge = (e: EdgeRef) => `${e.floor}.${cx(e.floor, e.x)}.${cy(e.floor, e.y)}${flipDir(e.dir, fx, fy)[0]}`;

  const floors = def.floors
    .map((f, i) => {
      const walls = (f.walls ?? []).map(([x, y]) => `${cx(i, x)}.${cy(i, y)}`).sort();
      return `${f.width}x${f.height}[${walls.join(' ')}]`;
    })
    .join('/');
  const ramps = (def.ramps ?? []).map((r) => [edge(r.a), edge(r.b)].sort().join('~')).sort();
  const vehicles = def.vehicles
    .map((v) => {
      const len = VEHICLE_LENGTH[v.kind];
      const horizontal = axisOf(v.facing) === 'h';
      const x = cx(v.floor, v.x, horizontal ? len : 1);
      const y = cy(v.floor, v.y, horizontal ? 1 : len);
      // Only a tow truck's facing changes how it plays.
      const orient = v.kind === 'tow' ? flipDir(v.facing, fx, fy)[0] : axisOf(v.facing);
      return `${KIND_CLASS[v.kind]}${v.floor}.${x}.${y}${orient}`;
    })
    .sort();
  return `${floors}|${edge(def.exit)}|${ramps.join(',')}|${vehicles.join(',')}|${def.cranes ?? 0}`;
}

/**
 * A key that is the same for two levels that play the same, ignoring vehicle ids,
 * truck vs bus, and mirror images.
 */
export function canonicalKey(def: LevelDef): string {
  let best = serialize(def, false, false);
  for (const [fx, fy] of [[true, false], [false, true], [true, true]] as const) {
    const key = serialize(def, fx, fy);
    if (key < best) best = key;
  }
  return best;
}

/** A copy of `def` with its vehicles moved to `state`. */
export function withState(def: LevelDef, state: GameState): LevelDef {
  const vehicles = def.vehicles.map((v, i) => {
    const s = state.vehicles[i];
    return s ? { ...v, floor: s.floor, x: s.x, y: s.y, facing: s.facing } : { ...v };
  });
  return { ...def, vehicles, cranes: state.cranesLeft };
}

// ---------------------------------------------------------------------------
// Random layouts

/** Cell of an edge mouth on side `side` of a floor, in lane `lane`. */
function edgeCell(floor: number, side: Dir, lane: number, w: number, h: number): EdgeRef {
  switch (side) {
    case 'left':
      return { floor, x: 0, y: lane, dir: side };
    case 'right':
      return { floor, x: w - 1, y: lane, dir: side };
    case 'up':
      return { floor, x: lane, y: 0, dir: side };
    case 'down':
      return { floor, x: lane, y: h - 1, dir: side };
  }
}

class Grid {
  private cells: Uint8Array;
  constructor(
    readonly floors: number,
    readonly w: number,
    readonly h: number,
  ) {
    this.cells = new Uint8Array(floors * w * h);
  }
  private at(f: number, x: number, y: number) {
    return (f * this.h + y) * this.w + x;
  }
  free(f: number, x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.cells[this.at(f, x, y)] === 0;
  }
  fill(f: number, x: number, y: number) {
    this.cells[this.at(f, x, y)] = 1;
  }
  /** Places a line of `len` cells if all are free. */
  tryLine(f: number, x: number, y: number, horizontal: boolean, len: number): boolean {
    for (let k = 0; k < len; k++) {
      if (!this.free(f, horizontal ? x + k : x, horizontal ? y : y + k)) return false;
    }
    for (let k = 0; k < len; k++) this.fill(f, horizontal ? x + k : x, horizontal ? y : y + k);
    return true;
  }
}

/**
 * A random garage for the settings. Floors are chained by ramps so the player can always
 * drive from any floor down to the exit lane if the way is clear. Loose floors on
 * multi-floor layouts get extra vehicles; see `floorProductLimit`.
 */
export function randomLayout(settings: GeneratorSettings, rng: Rng): LevelDef {
  const w = settings.width ?? DEFAULT_SIZE;
  const h = settings.height ?? DEFAULT_SIZE;
  const floorCount = settings.floors;

  // The exit, and with it the axis the player drives on.
  const exitSide = pick(rng, ['left', 'right', 'up', 'down'] as const);
  // Lanes run along the exit's axis: rows for a left/right exit, columns for up/down.
  const horizontalPlayer = axisOf(exitSide) === 'h';
  const laneCount = horizontalPlayer ? h : w;
  const laneLength = horizontalPlayer ? w : h;
  const exit = edgeCell(0, exitSide, randInt(rng, 1, laneCount - 2), w, h);
  const exitLane = axisOf(exitSide) === 'h' ? exit.y : exit.x;

  // Ramp chain on the exit's axis. Each ramp's lower mouth sits at the far end of the
  // lane the player uses on that floor, so coming down it heads towards the way out.
  const ramps: RampDef[] = [];
  const lanes = [exitLane];
  let towardOut: Dir = exitSide; // direction the player drives on the current floor
  for (let f = 1; f < floorCount; f++) {
    const lowerLane = lanes[f - 1] as number;
    const lower = edgeCell(f - 1, opposite(towardOut), lowerLane, w, h);
    const upperSide = pick(rng, horizontalPlayer ? (['left', 'right'] as const) : (['up', 'down'] as const));
    const upperLane = randInt(rng, 0, laneCount - 1);
    ramps.push({ a: edgeCell(f, upperSide, upperLane, w, h), b: lower });
    lanes.push(upperLane);
    towardOut = upperSide;
  }

  // The player's lanes stay empty, so the player can reach the exit from anywhere on its
  // route at first. The search later finds positions where blockers have moved in.
  const grid = new Grid(floorCount, w, h);
  const rampMouths = new Set(ramps.flatMap((r) => [r.a, r.b]).map((e) => `${e.floor}.${e.x}.${e.y}`));
  const routeFloors = Math.min(settings.routeFloors ?? floorCount, floorCount);
  lanes.slice(0, routeFloors).forEach((lane, f) => {
    for (let p = 0; p < laneLength; p++) grid.fill(f, horizontalPlayer ? p : lane, horizontalPlayer ? lane : p);
  });

  const floors = Array.from({ length: floorCount }, (_, f) => {
    const walls: [number, number][] = [];
    for (let i = 0; i < (settings.walls ?? 0); i++) {
      const x = randInt(rng, 0, w - 1);
      const y = randInt(rng, 0, h - 1);
      if (!grid.free(f, x, y) || rampMouths.has(`${f}.${x}.${y}`)) continue;
      grid.fill(f, x, y);
      walls.push([x, y]);
    }
    return walls.length ? { width: w, height: h, walls } : { width: w, height: h };
  });

  const vehicles: VehicleDef[] = [];

  // Player: one step from the exit, so a win is always reachable from the layout.
  const exitAt = horizontalPlayer ? exit.x : exit.y;
  const playerAt = exitSide === 'left' || exitSide === 'up' ? exitAt + 1 : exitAt - 2;
  vehicles.push({
    id: 'P',
    kind: 'player',
    floor: 0,
    x: horizontalPlayer ? playerAt : exitLane,
    y: horizontalPlayer ? exitLane : playerAt,
    facing: exitSide,
  });

  /** Parks a vehicle at a random free spot (on `onFloor` if given). False if none found. */
  const place = (kind: BlockerKind, onFloor?: number): boolean => {
    const len = VEHICLE_LENGTH[kind];
    for (let tries = 0; tries < 60; tries++) {
      const floor = onFloor ?? randInt(rng, 0, floorCount - 1);
      const horizontal = rng() < 0.5;
      const x = randInt(rng, 0, horizontal ? w - len : w - 1);
      const y = randInt(rng, 0, horizontal ? h - 1 : h - len);
      if (!grid.tryLine(floor, x, y, horizontal, len)) continue;
      const facing: Dir = horizontal ? pick(rng, ['left', 'right'] as const) : pick(rng, ['up', 'down'] as const);
      vehicles.push({ id: VEHICLE_IDS[vehicles.length - 1] ?? `v${vehicles.length}`, kind, floor, x, y, facing });
      return true;
    }
    return false;
  };

  // Blockers, longest first so they still fit. A full floor just takes fewer than asked for.
  const kinds: BlockerKind[] = [];
  for (const [kind, count] of Object.entries(settings.vehicles) as [BlockerKind, number][]) {
    for (let i = 0; i < count; i++) kinds.push(kind);
  }
  kinds.sort((a, b) => VEHICLE_LENGTH[b] - VEHICLE_LENGTH[a]);
  for (const kind of kinds) place(kind);

  const def: LevelDef = { id: 'random', floors, exit, vehicles };
  if (ramps.length) def.ramps = ramps;

  // Multi-floor: tighten loose floors by parking extra vehicles (the shortest kind allowed,
  // never a tow truck) until each floor has at most its share of the position budget.
  if (floorCount > 1) {
    const share = Math.floor(Math.pow(settings.floorProductLimit ?? DEFAULT_FLOOR_PRODUCT, 1 / floorCount));
    const filler = (Object.keys(settings.vehicles) as BlockerKind[])
      .filter((k) => k !== 'tow' && (settings.vehicles[k] ?? 0) > 0)
      .sort((a, b) => VEHICLE_LENGTH[a] - VEHICLE_LENGTH[b])[0];
    for (let f = 0; f < floorCount && filler; f++) {
      for (let extra = 0; extra < 12; extra++) {
        if (floorStateCount(compileLevel(def), f, share) <= share || !place(filler, f)) break;
      }
    }
  }
  return def;
}

// ---------------------------------------------------------------------------
// Grading and checks

/** Difficulty score: par, plus a bonus for how much searching it takes to find the solution. */
export function rateDifficulty(par: number, explored: number): number {
  return Math.round((par + Math.log2(Math.max(1, explored)) / 2) * 10) / 10;
}

/** Which features a solution uses, found by replaying it. */
export function featuresUsed(level: Level, moves: LevelDef['solution'] = []): Set<Feature> {
  const used = new Set<Feature>();
  let state = level.initial;
  for (const move of moves) {
    const index = level.ids.indexOf(move.vehicle);
    const before = state.vehicles[index];
    const step = applyMove(level, state, move);
    if (move.type === 'crane') used.add('crane');
    if (step.towed) used.add('tow');
    if (before && step.state.vehicles[index]?.floor !== before.floor) used.add('ramp');
    state = step.state;
  }
  return used;
}

/**
 * How many solution moves could already be played from the start: each vehicle's first
 * move, tried on the untouched level. When most moves are like this the level is just a
 * sweep (shift every blocker once), not a puzzle where moves unlock each other.
 */
export function independentMoves(level: Level, moves: LevelDef['solution'] = []): number {
  const moved = new Set<string>();
  let free = 0;
  for (const move of moves) {
    if (!moved.has(move.vehicle)) {
      try {
        applyMove(level, level.initial, move);
        free++;
      } catch {
        // Needs earlier moves first.
      }
    }
    moved.add(move.vehicle);
  }
  return free;
}

/**
 * Canonical keys of every position along a solution, start included. Two levels sharing
 * any of these are the same puzzle (one is a later stage of the other).
 */
export function pathKeys(def: LevelDef, level: Level = compileLevel(def), moves = def.solution ?? []): string[] {
  const keys = [canonicalKey(def)];
  let state = level.initial;
  for (const move of moves) {
    state = applyMove(level, state, move).state;
    keys.push(canonicalKey(withState(def, state)));
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Generator

/**
 * Makes one level for the settings, or returns null after `maxAttempts` layouts.
 *
 * Each attempt places vehicles at random, explores the positions reachable from there,
 * and works out the distance to a win from each. A position at the target distance
 * becomes the level's start, so hard levels don't rely on luck. (When the layout has too
 * many positions to explore them all, distances are upper bounds and the solver decides.)
 * The pick is re-solved from scratch and rejected if its par is off target or trivial
 * (too short, or most of its moves could be played straight away in any order),
 * it misses a required feature, the solver needs too long, or any position on its
 * solution already belongs to a level in `seen`.
 */
export function generateLevel(settings: GeneratorSettings, options: GenerateOptions = {}): GeneratedLevel | null {
  const rng = options.rng ?? createRng(Date.now());
  const seen = options.seen ?? new Set<string>();
  const maxAttempts = options.maxAttempts ?? 500;
  const stats = options.stats ?? {};
  const reject = (reason: string) => {
    stats[reason] = (stats[reason] ?? 0) + 1;
  };
  const exploreLimit = settings.exploreLimit ?? 40_000;
  const solveLimit = settings.solveLimit ?? 150_000;
  const minPar = Math.max(1, settings.minPar ?? 2);
  const tolerance = settings.parTolerance ?? 0;
  const lo = Math.max(minPar, settings.targetPar - tolerance);
  const hi = Math.max(lo, settings.targetPar + tolerance);
  const cranes = settings.cranes ?? 0;
  const required = new Set<Feature>(settings.require ?? []);
  if (settings.floors > 1) required.add('ramp');
  if (cranes > 0) required.add('crane');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const layout = randomLayout(settings, rng);
    let level: Level;
    try {
      level = compileLevel(layout);
    } catch (e) {
      if (e instanceof LevelError) {
        reject('invalid layout');
        continue;
      }
      throw e;
    }

    if (settings.floors > 1) {
      const limit = settings.floorProductLimit ?? DEFAULT_FLOOR_PRODUCT;
      let product = 1;
      for (let f = 0; f < settings.floors && product <= limit; f++) {
        product *= floorStateCount(level, f, Math.ceil(limit / product));
      }
      if (product > limit) {
        reject('floor too loose');
        continue;
      }
    }

    // Layouts are explored without cranes: a crane drop can go almost anywhere, which
    // would multiply the positions. The crane is added to the chosen start instead.
    const graph = exploreStates(level, level.initial, exploreLimit);
    const dist = distancesToGoal(level, graph);
    if (graph.truncated) reject('layout too big to explore fully');

    // Without the crane the start must be harder than the target, so look further out.
    // In a truncated graph distances are upper bounds, so look further still.
    const from = cranes > 0 ? lo + 1 : lo;
    const to = hi + (cranes > 0 ? 10 : 0) + (graph.truncated ? 4 : 0);
    const want = cranes > 0 ? settings.targetPar + 4 : settings.targetPar;
    const candidates: number[] = [];
    for (let i = 0; i < dist.length; i++) {
      const d = dist[i]!;
      if (d < from || d > to) continue;
      if (settings.playerUpstairs && (graph.states[i]!.vehicles[level.playerIndex]?.floor ?? 0) === 0) continue;
      candidates.push(i);
    }
    if (candidates.length === 0) reject('no position at target par');
    shuffle(rng, candidates).sort((a, b) => Math.abs(dist[a]! - want) - Math.abs(dist[b]! - want));

    for (const c of candidates.slice(0, 6)) {
      const def: LevelDef = withState(layout, graph.states[c]!);
      def.id = options.id ?? 'generated';
      if (options.name) def.name = options.name;
      if (cranes > 0) def.cranes = cranes;
      else delete def.cranes;
      const start = compileLevel(def);
      const result = solve(start, start.initial, { maxStates: solveLimit });
      if (result.truncated) {
        reject('too slow to solve');
        continue;
      }
      if (cranes === 0 && !graph.truncated && result.par !== dist[c]) {
        throw new Error(`generator and solver disagree (${dist[c]} vs ${result.par})`);
      }
      if (result.par < lo || result.par > hi) {
        reject(result.par < minPar ? 'trivial' : 'par off target');
        continue;
      }

      if (result.par >= 4 && independentMoves(start, result.moves) * 2 > result.par) {
        reject('trivial');
        continue;
      }

      const used = featuresUsed(start, result.moves);
      const missing = [...required].find((f) => !used.has(f));
      if (missing) {
        reject(`solution skips ${missing}`);
        continue;
      }

      if (cranes > 0) {
        // The crane must matter: without it the level is longer or impossible.
        let withoutPar = dist[c]!;
        if (graph.truncated) {
          const without = solve(compileLevel({ ...def, cranes: 0 }), undefined, { maxStates: solveLimit });
          withoutPar = without.truncated ? 0 : without.solvable ? without.par : Infinity;
        }
        if (withoutPar <= result.par) {
          reject('crane not needed');
          continue;
        }
      }

      const keys = pathKeys(def, start, result.moves);
      if (keys.some((k) => seen.has(k))) {
        reject('duplicate');
        continue;
      }
      for (const k of keys) seen.add(k);

      def.par = result.par;
      def.difficulty = rateDifficulty(result.par, result.explored);
      def.solution = result.moves;
      return { def, par: result.par, difficulty: def.difficulty, attempts: attempt };
    }
  }
  return null;
}
