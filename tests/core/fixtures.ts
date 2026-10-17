import type { LevelDef } from '../../src/core';

const floor6 = { width: 6, height: 6 };

/** Player is one slide from the exit. */
export const oneMove: LevelDef = {
  id: 'one-move',
  floors: [floor6],
  exit: { floor: 0, x: 5, y: 2, dir: 'right' },
  vehicles: [{ id: 'P', kind: 'player', floor: 0, x: 3, y: 2, facing: 'right' }],
};

/**
 * Classic three-move jam:
 *   ..BB..
 *   ...A..
 *   PP.A.E
 *   ...T..
 *   ...T..
 *   ...T..
 * B must move so A can move up, then P drives out.
 */
export const classic3: LevelDef = {
  id: 'classic-3',
  floors: [floor6],
  exit: { floor: 0, x: 5, y: 2, dir: 'right' },
  vehicles: [
    { id: 'P', kind: 'player', floor: 0, x: 0, y: 2, facing: 'right' },
    { id: 'A', kind: 'car', floor: 0, x: 3, y: 1, facing: 'up' },
    { id: 'T', kind: 'truck', floor: 0, x: 3, y: 3, facing: 'down' },
    { id: 'B', kind: 'car', floor: 0, x: 2, y: 0, facing: 'right' },
  ],
};

/**
 * Player starts upstairs, drives left down the ramp, and comes out heading right on
 * the ground floor. Car C blocks the ground-floor lane.
 */
export const rampLevel: LevelDef = {
  id: 'ramp',
  floors: [floor6, floor6],
  exit: { floor: 0, x: 5, y: 2, dir: 'right' },
  ramps: [{ a: { floor: 1, x: 0, y: 2, dir: 'left' }, b: { floor: 0, x: 0, y: 2, dir: 'left' } }],
  vehicles: [
    { id: 'P', kind: 'player', floor: 1, x: 2, y: 2, facing: 'left' },
    { id: 'C', kind: 'car', floor: 0, x: 3, y: 1, facing: 'down' },
  ],
};

/**
 * 6 wide, 8 tall. V blocks the player's row and is walled in below.
 * Tow truck W sits directly above V, facing up, so V is hitched to it.
 */
export function towLevel(towKind: 'tow' | 'car'): LevelDef {
  return {
    id: `tow-${towKind}`,
    floors: [{ width: 6, height: 8, walls: [[3, 6]] }],
    exit: { floor: 0, x: 5, y: 4, dir: 'right' },
    vehicles: [
      { id: 'P', kind: 'player', floor: 0, x: 0, y: 4, facing: 'right' },
      { id: 'V', kind: 'car', floor: 0, x: 3, y: 4, facing: 'down' },
      { id: 'W', kind: towKind, floor: 0, x: 3, y: 2, facing: 'up' },
    ],
  };
}

/** V is walled in above and below; only the crane can clear it. */
export function craneLevel(cranes: number): LevelDef {
  return {
    id: `crane-${cranes}`,
    floors: [{ width: 6, height: 6, walls: [[3, 0], [3, 3]] }],
    exit: { floor: 0, x: 5, y: 2, dir: 'right' },
    cranes,
    vehicles: [
      { id: 'P', kind: 'player', floor: 0, x: 0, y: 2, facing: 'right' },
      { id: 'V', kind: 'car', floor: 0, x: 3, y: 1, facing: 'down' },
    ],
  };
}
