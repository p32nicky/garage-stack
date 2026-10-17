import { describe, expect, it } from 'vitest';
import {
  applyMove,
  compileLevel,
  hint,
  isSolved,
  solve,
  type GameState,
  type Level,
  type LevelDef,
  type Move,
} from '../../src/core';
import { classic3, craneLevel, oneMove, rampLevel, towLevel } from './fixtures';

/** Plays a move list and returns the final state, failing on any illegal move. */
function replay(level: Level, moves: Move[]): GameState {
  return moves.reduce((state, move) => applyMove(level, state, move).state, level.initial);
}

function expectPar(def: LevelDef, par: number) {
  const level = compileLevel(def);
  const result = solve(level);
  expect(result.solvable).toBe(true);
  expect(result.par).toBe(par);
  expect(result.moves).toHaveLength(par);
  expect(isSolved(level, replay(level, result.moves))).toBe(true);
  return result;
}

describe('solver', () => {
  it('solves a one-move level', () => {
    expectPar(oneMove, 1);
  });

  it('returns par 0 for a level that starts solved', () => {
    const def = structuredClone(oneMove);
    def.vehicles[0]!.x = 4;
    expectPar(def, 0);
  });

  it('finds the 3-move classic solution', () => {
    const { moves } = expectPar(classic3, 3);
    expect(moves[0]).toMatchObject({ type: 'slide', vehicle: 'B' });
    expect(moves[1]).toEqual({ type: 'slide', vehicle: 'A', dir: 'up', distance: 1 });
    expect(moves[2]).toEqual({ type: 'slide', vehicle: 'P', dir: 'right', distance: 4 });
  });

  it('uses ramps between floors', () => {
    const { moves } = expectPar(rampLevel, 2);
    expect(moves[1]).toEqual({ type: 'slide', vehicle: 'P', dir: 'left', distance: 8 });
  });

  it('uses a tow truck to save a move', () => {
    const { moves } = expectPar(towLevel('tow'), 2);
    expect(moves[0]).toEqual({ type: 'slide', vehicle: 'W', dir: 'up', distance: 2 });
    expectPar(towLevel('car'), 3);
  });

  it('uses the crane when it is the only way out', () => {
    const { moves } = expectPar(craneLevel(1), 2);
    expect(moves[0]?.type).toBe('crane');
  });

  it('reports unsolvable levels', () => {
    const result = solve(compileLevel(craneLevel(0)));
    expect(result).toMatchObject({ solvable: false, par: -1, truncated: false, moves: [] });
  });

  it('stops at the state limit', () => {
    const result = solve(compileLevel(classic3), undefined, { maxStates: 2 });
    expect(result.truncated).toBe(true);
    expect(result.solvable).toBe(false);
  });

  it('gives a hint from any position', () => {
    const level = compileLevel(classic3);
    const afterB = applyMove(level, level.initial, { type: 'slide', vehicle: 'B', dir: 'right', distance: 2 }).state;
    expect(hint(level, afterB)).toEqual({ type: 'slide', vehicle: 'A', dir: 'up', distance: 1 });
    const solved = replay(level, solve(level).moves);
    expect(hint(level, solved)).toBeNull();
  });

  it('solves a busier two-floor level with every vehicle type', () => {
    const def: LevelDef = {
      id: 'busy',
      floors: [
        { width: 6, height: 6, walls: [[0, 0]] },
        { width: 6, height: 6 },
      ],
      exit: { floor: 0, x: 5, y: 2, dir: 'right' },
      ramps: [{ a: { floor: 1, x: 0, y: 2, dir: 'left' }, b: { floor: 0, x: 0, y: 2, dir: 'left' } }],
      vehicles: [
        { id: 'P', kind: 'player', floor: 1, x: 3, y: 2, facing: 'left' },
        { id: 'A', kind: 'car', floor: 1, x: 1, y: 1, facing: 'down' },
        { id: 'B', kind: 'truck', floor: 1, x: 0, y: 3, facing: 'right' },
        { id: 'C', kind: 'car', floor: 1, x: 1, y: 0, facing: 'right' },
        { id: 'D', kind: 'car', floor: 0, x: 2, y: 1, facing: 'down' },
        { id: 'E', kind: 'truck', floor: 0, x: 4, y: 0, facing: 'down' },
        { id: 'F', kind: 'car', floor: 0, x: 0, y: 3, facing: 'right' },
        { id: 'G', kind: 'motorcycle', floor: 0, x: 3, y: 2, facing: 'up' },
        { id: 'H', kind: 'tow', floor: 0, x: 2, y: 4, facing: 'right' },
      ],
    };
    const level = compileLevel(def);
    const result = solve(level);
    expect(result.solvable).toBe(true);
    expect(result.par).toBe(6);
    expect(isSolved(level, replay(level, result.moves))).toBe(true);
    // The player goes down the ramp and out in one long slide.
    expect(result.moves[5]).toEqual({ type: 'slide', vehicle: 'P', dir: 'left', distance: 9 });
  }, 60_000);
});
