import { axisOf } from './geometry';
import { cellIndex, type Level } from './level';
import type { CellRef, GameState, VehicleState } from './types';

export const EMPTY = -1;
export const WALL = -2;

/** Cells a vehicle covers, from its anchor (smallest x/y) outward. */
export function vehicleCells(level: Level, index: number, v: VehicleState): CellRef[] {
  const length = level.lengths[index] ?? 0;
  const dx = axisOf(v.facing) === 'h' ? 1 : 0;
  const dy = 1 - dx;
  const cells: CellRef[] = [];
  for (let k = 0; k < length; k++) cells.push({ floor: v.floor, x: v.x + dx * k, y: v.y + dy * k });
  return cells;
}

/** Flat array: WALL, EMPTY, or the index of the vehicle in each cell. */
export function buildOccupancy(level: Level, state: GameState): Int16Array {
  const occ = new Int16Array(level.totalCells);
  for (let c = 0; c < level.totalCells; c++) occ[c] = level.walls[c] ? WALL : EMPTY;
  state.vehicles.forEach((v, i) => {
    for (const cell of vehicleCells(level, i, v)) occ[cellIndex(level, cell.floor, cell.x, cell.y)] = i;
  });
  return occ;
}

const FACING_CODE = { up: 0, right: 1, down: 2, left: 3 } as const;

/**
 * Compact string that identifies a state, for the solver's visited set: one character for
 * the cranes left, then one per vehicle packing floor, y, x (each under 16) and facing.
 * Not meant to be readable; short keys keep the visited set fast.
 */
export function stateKey(state: GameState): string {
  const codes = new Array<number>(state.vehicles.length + 1);
  codes[0] = state.cranesLeft;
  state.vehicles.forEach((v, i) => {
    codes[i + 1] = (((((v.floor << 4) | v.y) << 4) | v.x) << 2) | FACING_CODE[v.facing];
  });
  // Built in one call so the result is a flat string, which hashes much faster than one
  // grown a character at a time.
  return String.fromCharCode(...codes);
}

export function isSolved(level: Level, state: GameState): boolean {
  const player = state.vehicles[level.playerIndex];
  if (!player) return false;
  return vehicleCells(level, level.playerIndex, player).some(
    (c) => cellIndex(level, c.floor, c.x, c.y) === level.exitCell,
  );
}

export function cloneState(state: GameState): GameState {
  return { cranesLeft: state.cranesLeft, vehicles: state.vehicles.map((v) => ({ ...v })) };
}
