import { DX, DY, axisOf, dirIndex, isDir, opposite, type Dir } from './geometry';
import {
  VEHICLE_LENGTH,
  type CellRef,
  type EdgeRef,
  type GameState,
  type LevelDef,
  type VehicleKind,
} from './types';

export class LevelError extends Error {
  constructor(levelId: string, message: string) {
    super(`Level "${levelId}": ${message}`);
    this.name = 'LevelError';
  }
}

/** Where a step through a ramp lands. */
export interface RampLanding {
  floor: number;
  x: number;
  y: number;
  /** Direction of travel after entering the new floor. */
  dir: Dir;
}

/** A level validated and pre-processed for fast move generation. */
export interface Level {
  def: LevelDef;
  floorCount: number;
  widths: number[];
  heights: number[];
  /** Index of the first cell of each floor in flat cell arrays. */
  floorOffset: number[];
  totalCells: number;
  /** 1 where a wall blocks the cell. */
  walls: Uint8Array;
  ids: string[];
  kinds: VehicleKind[];
  lengths: number[];
  playerIndex: number;
  exitCell: number;
  /** Key = cell * 4 + dirIndex(dir) for a step out of a ramp mouth. */
  ramps: Map<number, RampLanding>;
  initial: GameState;
}

export function cellIndex(level: Level, floor: number, x: number, y: number): number {
  return (level.floorOffset[floor] ?? 0) + y * (level.widths[floor] ?? 0) + x;
}

export function inBounds(level: Level, floor: number, x: number, y: number): boolean {
  if (floor < 0 || floor >= level.floorCount) return false;
  return x >= 0 && y >= 0 && x < (level.widths[floor] ?? 0) && y < (level.heights[floor] ?? 0);
}

function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n);
}

/** Validates a level definition and builds the lookup tables the rules use. */
export function compileLevel(def: LevelDef): Level {
  const id = typeof def?.id === 'string' ? def.id : '?';
  const fail = (msg: string): never => {
    throw new LevelError(id, msg);
  };

  if (!Array.isArray(def.floors) || def.floors.length === 0) fail('needs at least one floor');

  const widths: number[] = [];
  const heights: number[] = [];
  const floorOffset: number[] = [];
  let totalCells = 0;
  def.floors.forEach((f, i) => {
    if (!isInt(f.width) || !isInt(f.height) || f.width < 1 || f.height < 1 || f.width > 16 || f.height > 16) {
      fail(`floor ${i} has an invalid size`);
    }
    widths.push(f.width);
    heights.push(f.height);
    floorOffset.push(totalCells);
    totalCells += f.width * f.height;
  });

  const level: Level = {
    def,
    floorCount: def.floors.length,
    widths,
    heights,
    floorOffset,
    totalCells,
    walls: new Uint8Array(totalCells),
    ids: [],
    kinds: [],
    lengths: [],
    playerIndex: -1,
    exitCell: -1,
    ramps: new Map(),
    initial: { vehicles: [], cranesLeft: 0 },
  };

  const checkCell = (c: CellRef, what: string) => {
    if (!isInt(c.floor) || !isInt(c.x) || !isInt(c.y) || !inBounds(level, c.floor, c.x, c.y)) {
      fail(`${what} is outside the garage`);
    }
  };
  /** An edge must sit on the border and point out of the floor. */
  const checkEdge = (e: EdgeRef, what: string) => {
    checkCell(e, what);
    if (!isDir(e.dir)) fail(`${what} has an invalid direction`);
    if (inBounds(level, e.floor, e.x + DX[e.dir], e.y + DY[e.dir])) {
      fail(`${what} must be on the edge of its floor, pointing outward`);
    }
  };

  def.floors.forEach((f, floor) => {
    for (const w of f.walls ?? []) {
      const [x, y] = w;
      checkCell({ floor, x, y }, `wall [${x},${y}] on floor ${floor}`);
      level.walls[cellIndex(level, floor, x, y)] = 1;
    }
  });

  // Exit
  if (!def.exit) fail('needs an exit');
  checkEdge(def.exit, 'exit');
  if (def.exit.floor !== 0) fail('exit must be on the ground floor (floor 0)');
  level.exitCell = cellIndex(level, def.exit.floor, def.exit.x, def.exit.y);
  if (level.walls[level.exitCell]) fail('exit cell is a wall');

  // Ramps
  const usedMouths = new Set<number>();
  (def.ramps ?? []).forEach((r, i) => {
    checkEdge(r.a, `ramp ${i} end a`);
    checkEdge(r.b, `ramp ${i} end b`);
    if (r.a.floor === r.b.floor) fail(`ramp ${i} must join two different floors`);
    if (axisOf(r.a.dir) !== axisOf(r.b.dir)) fail(`ramp ${i} ends must lie on the same axis`);
    for (const end of [r.a, r.b]) {
      const c = cellIndex(level, end.floor, end.x, end.y);
      if (level.walls[c]) fail(`ramp ${i} opens onto a wall`);
      if (c === level.exitCell && end.dir === def.exit.dir) fail(`ramp ${i} shares the exit`);
      const key = c * 4 + dirIndex(end.dir);
      if (usedMouths.has(key)) fail(`ramp ${i} overlaps another ramp`);
      usedMouths.add(key);
    }
    level.ramps.set(cellIndex(level, r.a.floor, r.a.x, r.a.y) * 4 + dirIndex(r.a.dir), {
      floor: r.b.floor,
      x: r.b.x,
      y: r.b.y,
      dir: opposite(r.b.dir),
    });
    level.ramps.set(cellIndex(level, r.b.floor, r.b.x, r.b.y) * 4 + dirIndex(r.b.dir), {
      floor: r.a.floor,
      x: r.a.x,
      y: r.a.y,
      dir: opposite(r.a.dir),
    });
  });

  // Vehicles
  if (!Array.isArray(def.vehicles) || def.vehicles.length === 0) fail('needs vehicles');
  const occupied = new Int16Array(totalCells).fill(-1);
  const seen = new Set<string>();
  def.vehicles.forEach((v, i) => {
    if (typeof v.id !== 'string' || v.id === '') fail(`vehicle ${i} needs an id`);
    if (seen.has(v.id)) fail(`duplicate vehicle id "${v.id}"`);
    seen.add(v.id);
    const length = VEHICLE_LENGTH[v.kind];
    if (length === undefined) fail(`vehicle "${v.id}" has unknown kind "${String(v.kind)}"`);
    if (!isDir(v.facing)) fail(`vehicle "${v.id}" has an invalid facing`);
    if (v.kind === 'player') {
      if (level.playerIndex !== -1) fail('only one player car allowed');
      level.playerIndex = i;
    }
    const dx = axisOf(v.facing) === 'h' ? 1 : 0;
    const dy = 1 - dx;
    for (let k = 0; k < length; k++) {
      const x = v.x + dx * k;
      const y = v.y + dy * k;
      checkCell({ floor: v.floor, x, y }, `vehicle "${v.id}"`);
      const c = cellIndex(level, v.floor, x, y);
      if (level.walls[c]) fail(`vehicle "${v.id}" overlaps a wall`);
      const other = occupied[c] ?? -1;
      if (other !== -1) fail(`vehicle "${v.id}" overlaps "${def.vehicles[other]?.id}"`);
      occupied[c] = i;
    }
    level.ids.push(v.id);
    level.kinds.push(v.kind);
    level.lengths.push(length);
    level.initial.vehicles.push({ floor: v.floor, x: v.x, y: v.y, facing: v.facing });
  });
  if (level.playerIndex === -1) fail('needs a player car');

  const cranes = def.cranes ?? 0;
  if (!isInt(cranes) || cranes < 0) fail('cranes must be a whole number of 0 or more');
  level.initial.cranesLeft = cranes;

  return level;
}
