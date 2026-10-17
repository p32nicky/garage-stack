import { describe, expect, it } from 'vitest';
import {
  applyMove,
  canonicalKey,
  compileLevel,
  featuresUsed,
  isSolved,
  pathKeys,
  solve,
  type LevelDef,
  type VehicleKind,
} from '../../src/core';
import { LEVELS } from '../../src/levels';

const kinds = (def: LevelDef) => new Set<VehicleKind>(def.vehicles.map((v) => v.kind));
const levelsIn = (first: number, last: number) => LEVELS.slice(first - 1, last);
const numbered = LEVELS.map((def, i) => [i + 1, def] as const);

describe('level pack', () => {
  it('has 120 levels numbered in order', () => {
    expect(LEVELS).toHaveLength(120);
    LEVELS.forEach((def, i) => expect(def.id).toBe(String(i + 1).padStart(3, '0')));
  });

  // The solver is the source of truth: every level must be solvable and its stored par
  // must be the true minimum. Multi-floor levels take a few seconds each.
  it.each(numbered)('level %i is solvable and its par is correct', (_n, def) => {
    const level = compileLevel(def);
    const result = solve(level, level.initial, { maxStates: 1_000_000 });
    expect(result.truncated).toBe(false);
    expect(result.solvable).toBe(true);
    expect(def.par).toBe(result.par);

    // The shipped solution (used for hints) must be legal, optimal and winning.
    const solution = def.solution ?? [];
    expect(solution).toHaveLength(result.par);
    const end = solution.reduce((state, move) => applyMove(level, state, move).state, level.initial);
    expect(isSolved(level, end)).toBe(true);
  }, 120_000);

  it('has no trivial levels', () => {
    for (const def of LEVELS) expect(def.par).toBeGreaterThanOrEqual(2);
  });

  it('has no duplicates, including one level being a later stage of another', () => {
    const starts = new Set(LEVELS.map(canonicalKey));
    expect(starts.size).toBe(LEVELS.length);
    const owner = new Map<string, string>();
    for (const def of LEVELS) {
      for (const key of new Set(pathKeys(def))) {
        expect(owner.get(key), `level ${def.id} overlaps level ${owner.get(key)}`).toBeUndefined();
        owner.set(key, def.id);
      }
    }
  });

  it('gets harder through each section', () => {
    for (const [first, last] of [[1, 20], [21, 50], [51, 80], [81, 100], [101, 120]] as const) {
      const pars = levelsIn(first, last).map((d) => d.par ?? 0);
      expect(pars).toEqual([...pars].sort((a, b) => a - b));
    }
    // Overall the pack climbs: each section ends harder than the one before.
    const lastPar = [20, 50, 80, 100, 120].map((n) => LEVELS[n - 1]?.par ?? 0);
    expect(lastPar).toEqual([...lastPar].sort((a, b) => a - b));
  });

  describe('follows the plan in CLAUDE.md', () => {
    it('1–20: single floor, cars only', () => {
      for (const def of levelsIn(1, 20)) {
        expect(def.floors).toHaveLength(1);
        expect([...kinds(def)].every((k) => k === 'player' || k === 'car')).toBe(true);
        expect(def.cranes ?? 0).toBe(0);
      }
    });

    it('21–50: two floors with ramps that the solution uses', () => {
      for (const def of levelsIn(21, 50)) {
        expect(def.floors).toHaveLength(2);
        expect(def.ramps?.length).toBeGreaterThan(0);
        expect([...kinds(def)].every((k) => k === 'player' || k === 'car')).toBe(true);
        expect(featuresUsed(compileLevel(def), def.solution).has('ramp')).toBe(true);
      }
    });

    it('51–80: motorcycles and trucks, no tow trucks or cranes', () => {
      for (const def of levelsIn(51, 80)) {
        const k = kinds(def);
        expect(k.has('motorcycle')).toBe(true);
        expect(k.has('truck') || k.has('bus')).toBe(true);
        expect(k.has('tow')).toBe(false);
        expect(def.cranes ?? 0).toBe(0);
      }
    });

    it('81–100: tow trucks, and the solution tows', () => {
      for (const def of levelsIn(81, 100)) {
        expect(kinds(def).has('tow')).toBe(true);
        expect(featuresUsed(compileLevel(def), def.solution).has('tow')).toBe(true);
        expect(def.cranes ?? 0).toBe(0);
      }
    });

    it('101–120: three floors, at most one crane, and crane levels need it', () => {
      const craneLevels = levelsIn(101, 120).filter((d) => (d.cranes ?? 0) > 0);
      expect(craneLevels.length).toBeGreaterThanOrEqual(5);
      for (const def of levelsIn(101, 120)) {
        expect(def.floors).toHaveLength(3);
        expect(def.cranes ?? 0).toBeLessThanOrEqual(1);
      }
      for (const def of craneLevels) {
        expect(featuresUsed(compileLevel(def), def.solution).has('crane')).toBe(true);
        const without = solve(compileLevel({ ...def, cranes: 0 }), undefined, { maxStates: 1_000_000 });
        expect(without.truncated).toBe(false);
        if (without.solvable) expect(without.par).toBeGreaterThan(def.par ?? 0);
      }
    }, 120_000);
  });
});
