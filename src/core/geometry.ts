/** Grid directions. y grows downward, so "up" means y - 1. */
export type Dir = 'up' | 'down' | 'left' | 'right';
export type Axis = 'h' | 'v';

export const DIRS: readonly Dir[] = ['up', 'right', 'down', 'left'];

export const DX: Readonly<Record<Dir, number>> = { up: 0, down: 0, left: -1, right: 1 };
export const DY: Readonly<Record<Dir, number>> = { up: -1, down: 1, left: 0, right: 0 };

const OPPOSITE: Readonly<Record<Dir, Dir>> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export function opposite(dir: Dir): Dir {
  return OPPOSITE[dir];
}

export function axisOf(dir: Dir): Axis {
  return dir === 'left' || dir === 'right' ? 'h' : 'v';
}

/** The two directions a vehicle on this axis can slide. */
export function dirsOnAxis(axis: Axis): [Dir, Dir] {
  return axis === 'h' ? ['left', 'right'] : ['up', 'down'];
}

export function dirIndex(dir: Dir): number {
  return DIRS.indexOf(dir);
}

export function isDir(value: unknown): value is Dir {
  return value === 'up' || value === 'down' || value === 'left' || value === 'right';
}
