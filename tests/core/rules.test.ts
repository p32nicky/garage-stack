import { describe, expect, it } from 'vitest';
import {
  LevelError,
  applyMove,
  axisOf,
  compileLevel,
  isSolved,
  movesForVehicle,
  opposite,
  successors,
  toAscii,
  type LevelDef,
  type SlideMove,
} from '../../src/core';
import { classic3, craneLevel, oneMove, rampLevel, towLevel } from './fixtures';

function slideDistances(def: LevelDef, vehicle: string, dir: SlideMove['dir']): number[] {
  const level = compileLevel(def);
  return movesForVehicle(level, level.initial, vehicle)
    .map((s) => s.move)
    .filter((m): m is SlideMove => m.type === 'slide' && m.dir === dir)
    .map((m) => m.distance);
}

describe('geometry', () => {
  it('knows opposites and axes', () => {
    expect(opposite('up')).toBe('down');
    expect(opposite('left')).toBe('right');
    expect(axisOf('left')).toBe('h');
    expect(axisOf('down')).toBe('v');
  });
});

describe('level validation', () => {
  const base = (): LevelDef => structuredClone(classic3);

  it('accepts a valid level', () => {
    expect(() => compileLevel(base())).not.toThrow();
  });

  it('rejects overlapping vehicles', () => {
    const def = base();
    def.vehicles.push({ id: 'X', kind: 'car', floor: 0, x: 0, y: 2, facing: 'right' });
    expect(() => compileLevel(def)).toThrow(LevelError);
  });

  it('rejects vehicles hanging off the floor', () => {
    const def = base();
    def.vehicles.push({ id: 'X', kind: 'truck', floor: 0, x: 4, y: 5, facing: 'right' });
    expect(() => compileLevel(def)).toThrow(/outside/);
  });

  it('rejects vehicles on walls', () => {
    const def = base();
    def.floors[0]!.walls = [[0, 2]];
    expect(() => compileLevel(def)).toThrow(/wall/);
  });

  it('needs exactly one player', () => {
    const none = base();
    none.vehicles = none.vehicles.filter((v) => v.kind !== 'player');
    expect(() => compileLevel(none)).toThrow(/player/);
    const two = base();
    two.vehicles.push({ id: 'P2', kind: 'player', floor: 0, x: 0, y: 5, facing: 'right' });
    expect(() => compileLevel(two)).toThrow(/one player/);
  });

  it('rejects duplicate ids', () => {
    const def = base();
    def.vehicles.push({ id: 'A', kind: 'motorcycle', floor: 0, x: 5, y: 5, facing: 'up' });
    expect(() => compileLevel(def)).toThrow(/duplicate/);
  });

  it('requires the exit on the ground-floor edge, pointing out', () => {
    const inner = base();
    inner.exit = { floor: 0, x: 3, y: 3, dir: 'right' };
    expect(() => compileLevel(inner)).toThrow(/edge/);
    const inward = base();
    inward.exit = { floor: 0, x: 5, y: 2, dir: 'left' };
    expect(() => compileLevel(inward)).toThrow(/edge/);
    const upstairs = structuredClone(rampLevel);
    upstairs.exit = { floor: 1, x: 5, y: 2, dir: 'right' };
    expect(() => compileLevel(upstairs)).toThrow(/ground floor/);
  });

  it('rejects bad ramps', () => {
    const sameFloor = structuredClone(rampLevel);
    sameFloor.ramps = [{ a: { floor: 0, x: 0, y: 0, dir: 'left' }, b: { floor: 0, x: 0, y: 4, dir: 'left' } }];
    expect(() => compileLevel(sameFloor)).toThrow(/different floors/);
    const crossAxis = structuredClone(rampLevel);
    crossAxis.ramps = [{ a: { floor: 1, x: 0, y: 2, dir: 'left' }, b: { floor: 0, x: 2, y: 0, dir: 'up' } }];
    expect(() => compileLevel(crossAxis)).toThrow(/same axis/);
  });

  it('rejects unknown vehicle kinds and negative cranes', () => {
    const kind = base() as unknown as { vehicles: { kind: string }[] };
    kind.vehicles[1]!.kind = 'tank';
    expect(() => compileLevel(kind as unknown as LevelDef)).toThrow(/unknown kind/);
    const cranes = base();
    cranes.cranes = -1;
    expect(() => compileLevel(cranes)).toThrow(/cranes/);
  });
});

describe('sliding', () => {
  it('slides any distance until blocked', () => {
    // B covers x 2-3 on row 0: it can go left 1-2 or right 1-2.
    expect(slideDistances(classic3, 'B', 'left')).toEqual([1, 2]);
    expect(slideDistances(classic3, 'B', 'right')).toEqual([1, 2]);
  });

  it('is blocked by other vehicles', () => {
    expect(slideDistances(classic3, 'A', 'up')).toEqual([]);
    expect(slideDistances(classic3, 'A', 'down')).toEqual([]);
    expect(slideDistances(classic3, 'T', 'up')).toEqual([]);
  });

  it('is blocked by walls', () => {
    expect(slideDistances(craneLevel(0), 'V', 'up')).toEqual([]);
    expect(slideDistances(craneLevel(0), 'V', 'down')).toEqual([]);
  });

  it('only moves along the vehicle axis', () => {
    expect(slideDistances(classic3, 'B', 'up')).toEqual([]);
  });

  it('applies a move and leaves the original state untouched', () => {
    const level = compileLevel(classic3);
    const before = toAscii(level);
    const { state } = applyMove(level, level.initial, { type: 'slide', vehicle: 'B', dir: 'left', distance: 1 });
    expect(state.vehicles[3]).toEqual({ floor: 0, x: 1, y: 0, facing: 'right' });
    expect(toAscii(level)).toBe(before);
  });

  it('keeps facing when reversing', () => {
    const level = compileLevel(classic3);
    const { state } = applyMove(level, level.initial, { type: 'slide', vehicle: 'B', dir: 'left', distance: 2 });
    expect(state.vehicles[3]?.facing).toBe('right');
  });

  it('throws on an illegal move', () => {
    const level = compileLevel(classic3);
    expect(() => applyMove(level, level.initial, { type: 'slide', vehicle: 'A', dir: 'up', distance: 1 })).toThrow(
      /Illegal/,
    );
  });
});

describe('winning', () => {
  it('wins when the player covers the exit', () => {
    const level = compileLevel(oneMove);
    expect(isSolved(level, level.initial)).toBe(false);
    const { state } = applyMove(level, level.initial, { type: 'slide', vehicle: 'P', dir: 'right', distance: 1 });
    expect(isSolved(level, state)).toBe(true);
    expect(successors(level, state)).toEqual([]);
  });

  it('only the player can win', () => {
    const def = structuredClone(oneMove);
    def.vehicles = [
      { id: 'P', kind: 'player', floor: 0, x: 0, y: 0, facing: 'down' },
      { id: 'X', kind: 'car', floor: 0, x: 4, y: 2, facing: 'right' },
    ];
    const level = compileLevel(def);
    expect(isSolved(level, level.initial)).toBe(false);
  });
});

describe('ramps', () => {
  it('drives down the ramp and turns around onto the ground floor', () => {
    const level = compileLevel(rampLevel);
    const moves = movesForVehicle(level, level.initial, 'P').filter(
      (s) => s.move.type === 'slide' && s.move.dir === 'left',
    );
    // Left 1-2 stay upstairs; left 3 would straddle the ramp; 4-5 land downstairs until car C at x=3.
    expect(moves.map((s) => (s.move as SlideMove).distance)).toEqual([1, 2, 4, 5]);
    const landed = moves[2]!.state.vehicles[0]!;
    expect(landed).toEqual({ floor: 0, x: 0, y: 2, facing: 'right' });
  });

  it('never stops a vehicle half on a ramp', () => {
    const def = structuredClone(rampLevel);
    def.vehicles.push({ id: 'D', kind: 'car', floor: 0, x: 1, y: 1, facing: 'down' });
    expect(slideDistances(def, 'P', 'left')).toEqual([1, 2]);
  });

  it('works in reverse: up the ramp from the ground floor', () => {
    const def = structuredClone(rampLevel);
    def.vehicles = [
      { id: 'P', kind: 'player', floor: 0, x: 3, y: 0, facing: 'down' },
      { id: 'Q', kind: 'car', floor: 0, x: 1, y: 2, facing: 'left' },
    ];
    const level = compileLevel(def);
    const up = movesForVehicle(level, level.initial, 'Q').filter(
      (s) => s.move.type === 'slide' && s.move.dir === 'left',
    );
    // Q covers x 1-2. Left 1 stays down; left 2 straddles; left 3+ lands upstairs heading right.
    expect(up.map((s) => (s.move as SlideMove).distance)).toEqual([1, 3, 4, 5, 6, 7]);
    expect(up[1]!.state.vehicles[1]).toEqual({ floor: 1, x: 0, y: 2, facing: 'right' });
  });
});

describe('tow trucks', () => {
  it('drags the hitched vehicle when driving forward', () => {
    const level = compileLevel(towLevel('tow'));
    const up = movesForVehicle(level, level.initial, 'W').filter(
      (s) => s.move.type === 'slide' && s.move.dir === 'up',
    );
    expect(up.map((s) => (s.move as SlideMove).distance)).toEqual([1, 2]);
    const far = up[1]!;
    expect(far.towed).toBe('V');
    expect(far.state.vehicles[2]).toEqual({ floor: 0, x: 3, y: 0, facing: 'up' });
    expect(far.state.vehicles[1]).toEqual({ floor: 0, x: 3, y: 2, facing: 'down' });
  });

  it('cannot reverse into its hitched vehicle', () => {
    expect(slideDistances(towLevel('tow'), 'W', 'down')).toEqual([]);
  });

  it('a normal car does not drag anything', () => {
    const level = compileLevel(towLevel('car'));
    const up = movesForVehicle(level, level.initial, 'W').filter(
      (s) => s.move.type === 'slide' && s.move.dir === 'up',
    );
    expect(up.every((s) => s.towed === undefined)).toBe(true);
    expect(up[1]!.state.vehicles[1]).toEqual({ floor: 0, x: 3, y: 4, facing: 'down' });
  });
});

describe('crane', () => {
  it('lifts a vehicle to any free spot on its floor and uses up a crane', () => {
    const level = compileLevel(craneLevel(1));
    const lifts = movesForVehicle(level, level.initial, 'V').filter((s) => s.move.type === 'crane');
    expect(lifts.length).toBeGreaterThan(0);
    for (const s of lifts) {
      expect(s.state.cranesLeft).toBe(0);
      expect(s.state.vehicles[1]!.floor).toBe(0);
      expect(s.state.vehicles[1]!.facing).toBe('down');
    }
    const { state } = applyMove(level, level.initial, { type: 'crane', vehicle: 'V', floor: 0, x: 5, y: 4 });
    expect(state.vehicles[1]).toEqual({ floor: 0, x: 5, y: 4, facing: 'down' });
  });

  it('cannot drop onto walls or other vehicles', () => {
    const level = compileLevel(craneLevel(1));
    expect(() => applyMove(level, level.initial, { type: 'crane', vehicle: 'V', floor: 0, x: 3, y: 3 })).toThrow();
    expect(() => applyMove(level, level.initial, { type: 'crane', vehicle: 'V', floor: 0, x: 0, y: 1 })).toThrow();
  });

  it('cannot lift the player, or be used with no cranes left', () => {
    const level = compileLevel(craneLevel(1));
    expect(movesForVehicle(level, level.initial, 'P').some((s) => s.move.type === 'crane')).toBe(false);
    const none = compileLevel(craneLevel(0));
    expect(successors(none, none.initial).some((s) => s.move.type === 'crane')).toBe(false);
  });
});

describe('debug view', () => {
  it('draws the board', () => {
    expect(toAscii(compileLevel(classic3))).toBe(
      ['floor 0', '..BB..', '...A..', 'PP.A.E', '...T..', '...T..', '...T..'].join('\n'),
    );
  });
});
