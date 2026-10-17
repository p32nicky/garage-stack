import { DX, DY, axisOf, dirIndex, dirsOnAxis, opposite, type Dir } from './geometry';
import { cellIndex, inBounds, type Level } from './level';
import { EMPTY, WALL, buildOccupancy, isSolved, vehicleCells } from './state';
import type { CraneMove, GameState, Move, SlideMove, VehicleState } from './types';

/** A cell reached while sliding, with the travel direction used to enter it. */
interface Step {
  floor: number;
  x: number;
  y: number;
  dir: Dir;
}

/** A legal move and the state it leads to. */
export interface Successor {
  move: Move;
  state: GameState;
  /** Id of a vehicle dragged along by a tow truck in this move. */
  towed?: string;
}

/** One cell forward in `dir`, following a ramp if the cell is a ramp mouth. */
function stepFrom(level: Level, s: { floor: number; x: number; y: number }, dir: Dir): Step | null {
  const ramp = level.ramps.get(cellIndex(level, s.floor, s.x, s.y) * 4 + dirIndex(dir));
  if (ramp) return { floor: ramp.floor, x: ramp.x, y: ramp.y, dir: ramp.dir };
  const x = s.x + DX[dir];
  const y = s.y + DY[dir];
  if (!inBounds(level, s.floor, x, y)) return null;
  return { floor: s.floor, x, y, dir };
}

/** A vehicle's cells ordered from rear to front for travel in `dir`. */
function orderedCells(level: Level, index: number, v: VehicleState, dir: Dir): Step[] {
  const cells = vehicleCells(level, index, v).map((c) => ({ ...c, dir }));
  return dir === 'right' || dir === 'down' ? cells : cells.reverse();
}

/**
 * The vehicle hitched to a tow truck: the one directly behind its rear,
 * on the same floor and lined up on the same axis. Returns -1 if none.
 */
export function hitchedIndex(level: Level, state: GameState, occ: Int16Array, towIndex: number): number {
  const tow = state.vehicles[towIndex];
  if (!tow || level.kinds[towIndex] !== 'tow') return -1;
  const rear = orderedCells(level, towIndex, tow, tow.facing)[0];
  if (!rear) return -1;
  const behind = stepFrom(level, rear, opposite(tow.facing));
  if (!behind || behind.floor !== tow.floor) return -1;
  const other = occ[cellIndex(level, behind.floor, behind.x, behind.y)] ?? EMPTY;
  if (other < 0) return -1;
  const hitched = state.vehicles[other];
  if (!hitched || axisOf(hitched.facing) !== axisOf(tow.facing)) return -1;
  return other;
}

/** Every stopping point for sliding vehicle `index` in `dir`. */
function slideSuccessors(level: Level, state: GameState, occ: Int16Array, index: number, dir: Dir): Successor[] {
  const v = state.vehicles[index];
  if (!v || axisOf(v.facing) !== axisOf(dir)) return [];

  // The "train" is the vehicles moving together, rear first.
  let pieces = [index];
  if (level.kinds[index] === 'tow' && dir === v.facing) {
    const hitched = hitchedIndex(level, state, occ, index);
    if (hitched >= 0) pieces = [hitched, index];
  }

  const path: Step[] = [];
  for (const p of pieces) {
    const pv = state.vehicles[p];
    if (pv) path.push(...orderedCells(level, p, pv, dir));
  }
  const total = path.length;
  const results: Successor[] = [];

  let front = path[total - 1];
  for (let step = 1; front; step++) {
    // Follow the current travel direction, which may have turned around on a ramp.
    const next = stepFrom(level, front, front.dir);
    if (!next) break;
    const occupant = occ[cellIndex(level, next.floor, next.x, next.y)] ?? WALL;
    if (occupant !== EMPTY) break;
    path.push(next);
    front = next;

    // A vehicle may not stop part-way through a ramp: each piece must sit on one floor.
    const placed: VehicleState[] = [];
    let offset = step;
    let ok = true;
    for (const p of pieces) {
      const len = level.lengths[p] ?? 0;
      const first = path[offset];
      const last = path[offset + len - 1];
      const start = state.vehicles[p];
      if (!first || !last || !start) {
        ok = false;
        break;
      }
      let x = first.x;
      let y = first.y;
      for (let k = offset + 1; k < offset + len; k++) {
        const c = path[k] as Step;
        if (c.floor !== first.floor) ok = false;
        if (c.x < x) x = c.x;
        if (c.y < y) y = c.y;
      }
      offset += len;
      if (!ok) break;
      const movedForward = dir === start.facing;
      placed.push({ floor: first.floor, x, y, facing: movedForward ? last.dir : opposite(last.dir) });
    }
    if (!ok) continue;

    const vehicles = state.vehicles.slice();
    pieces.forEach((p, k) => {
      const pv = placed[k];
      if (pv) vehicles[p] = pv;
    });
    const move: SlideMove = { type: 'slide', vehicle: level.ids[index] ?? '', dir, distance: step };
    const successor: Successor = { move, state: { vehicles, cranesLeft: state.cranesLeft } };
    if (pieces.length > 1 && pieces[0] !== undefined) successor.towed = level.ids[pieces[0]];
    results.push(successor);
  }
  return results;
}

/** Every place the crane can drop vehicle `index` (same floor, same orientation). */
function craneSuccessors(level: Level, state: GameState, occ: Int16Array, index: number): Successor[] {
  const v = state.vehicles[index];
  if (!v || state.cranesLeft <= 0 || index === level.playerIndex) return [];
  const len = level.lengths[index] ?? 0;
  const dx = axisOf(v.facing) === 'h' ? 1 : 0;
  const dy = 1 - dx;
  const w = level.widths[v.floor] ?? 0;
  const h = level.heights[v.floor] ?? 0;
  const results: Successor[] = [];
  for (let y = 0; y + dy * (len - 1) < h; y++) {
    for (let x = 0; x + dx * (len - 1) < w; x++) {
      if (x === v.x && y === v.y) continue;
      let free = true;
      for (let k = 0; k < len && free; k++) {
        const o = occ[cellIndex(level, v.floor, x + dx * k, y + dy * k)] ?? WALL;
        if (o !== EMPTY && o !== index) free = false;
      }
      if (!free) continue;
      const vehicles = state.vehicles.slice();
      vehicles[index] = { floor: v.floor, x, y, facing: v.facing };
      const move: CraneMove = { type: 'crane', vehicle: level.ids[index] ?? '', floor: v.floor, x, y };
      results.push({ move, state: { vehicles, cranesLeft: state.cranesLeft - 1 } });
    }
  }
  return results;
}

/** All legal moves from `state`. A solved state has none. */
export function successors(level: Level, state: GameState): Successor[] {
  if (isSolved(level, state)) return [];
  const occ = buildOccupancy(level, state);
  const out: Successor[] = [];
  state.vehicles.forEach((v, i) => {
    for (const dir of dirsOnAxis(axisOf(v.facing))) out.push(...slideSuccessors(level, state, occ, i, dir));
  });
  if (state.cranesLeft > 0) {
    state.vehicles.forEach((_, i) => out.push(...craneSuccessors(level, state, occ, i)));
  }
  return out;
}

/** Legal moves for one vehicle (for the UI). */
export function movesForVehicle(level: Level, state: GameState, vehicleId: string): Successor[] {
  const index = level.ids.indexOf(vehicleId);
  const v = state.vehicles[index];
  if (!v || isSolved(level, state)) return [];
  const occ = buildOccupancy(level, state);
  const out: Successor[] = [];
  for (const dir of dirsOnAxis(axisOf(v.facing))) out.push(...slideSuccessors(level, state, occ, index, dir));
  out.push(...craneSuccessors(level, state, occ, index));
  return out;
}

function sameMove(a: Move, b: Move): boolean {
  if (a.type === 'slide' && b.type === 'slide') {
    return a.vehicle === b.vehicle && a.dir === b.dir && a.distance === b.distance;
  }
  if (a.type === 'crane' && b.type === 'crane') {
    return a.vehicle === b.vehicle && a.floor === b.floor && a.x === b.x && a.y === b.y;
  }
  return false;
}

/** Applies a move, throwing if it is not legal. */
export function applyMove(level: Level, state: GameState, move: Move): Successor {
  const found = movesForVehicle(level, state, move.vehicle).find((s) => sameMove(s.move, move));
  if (!found) throw new Error(`Illegal move: ${JSON.stringify(move)}`);
  return found;
}
