import type { Level } from './level';
import { successors } from './moves';
import { isSolved, stateKey } from './state';
import type { GameState, Move } from './types';

export interface SolveOptions {
  /** Give up after visiting this many states. */
  maxStates?: number;
}

export interface SolveResult {
  solvable: boolean;
  /** Shortest solution (empty if unsolvable or already solved). */
  moves: Move[];
  /** Minimum number of moves, or -1 if unsolvable. */
  par: number;
  /** States visited. */
  explored: number;
  /** True if the search hit maxStates before finishing. */
  truncated: boolean;
}

interface Node {
  state: GameState;
  parent: number;
  move: Move | null;
}

/** Breadth-first search for the minimum-move solution. */
export function solve(level: Level, start: GameState = level.initial, options: SolveOptions = {}): SolveResult {
  const maxStates = options.maxStates ?? 500_000;
  if (isSolved(level, start)) return { solvable: true, moves: [], par: 0, explored: 1, truncated: false };

  const nodes: Node[] = [{ state: start, parent: -1, move: null }];
  const visited = new Set<string>([stateKey(start)]);

  for (let head = 0; head < nodes.length; head++) {
    const node = nodes[head];
    if (!node) break;
    for (const next of successors(level, node.state)) {
      const key = stateKey(next.state);
      if (visited.has(key)) continue;
      visited.add(key);
      nodes.push({ state: next.state, parent: head, move: next.move });
      if (isSolved(level, next.state)) {
        const moves: Move[] = [];
        for (let i = nodes.length - 1; i > 0; ) {
          const n = nodes[i];
          if (!n || !n.move) break;
          moves.push(n.move);
          i = n.parent;
        }
        moves.reverse();
        return { solvable: true, moves, par: moves.length, explored: visited.size, truncated: false };
      }
      if (visited.size >= maxStates) {
        return { solvable: false, moves: [], par: -1, explored: visited.size, truncated: true };
      }
    }
  }
  return { solvable: false, moves: [], par: -1, explored: visited.size, truncated: false };
}

/** Next optimal move from the current position, or null if none. */
export function hint(level: Level, state: GameState, options?: SolveOptions): Move | null {
  return solve(level, state, options).moves[0] ?? null;
}
