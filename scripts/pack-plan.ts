// The 120-level pack layout from CLAUDE.md, as generator settings per level.
import type { GeneratorSettings } from '../src/core';

export interface Section {
  name: string;
  first: number;
  last: number;
  /** Target par for the first and last level; levels in between ramp up evenly. */
  par: [number, number];
  /** Settings for a level, given its position in the section (0 = first, 1 = last). */
  settings(t: number, level: number): Omit<GeneratorSettings, 'targetPar'> & { targetParOverride?: number };
}

const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

export const SECTIONS: Section[] = [
  {
    name: 'Tutorial: one floor, cars only',
    first: 1,
    last: 20,
    par: [2, 11],
    settings: (t) => ({ floors: 1, vehicles: { car: lerp(3, 12, t) }, exploreLimit: 60_000 }),
  },
  {
    name: 'Two floors with ramps',
    first: 21,
    last: 50,
    par: [6, 12],
    settings: (_t, level) => ({
      floors: 2,
      vehicles: { car: 30 },
      walls: 1,
      parTolerance: 1,
      // Mostly the player starts upstairs; every third level it's blockers that use the ramp.
      ...(level % 3 === 0 ? { routeFloors: 1 } : { playerUpstairs: true }),
      exploreLimit: 80_000,
      solveLimit: 100_000,
    }),
  },
  {
    name: 'Motorcycles and trucks',
    first: 51,
    last: 80,
    par: [8, 14],
    settings: (t, level) =>
      level <= 62
        ? {
            floors: 1,
            vehicles: { car: 8, truck: 2, bus: 1, motorcycle: lerp(2, 4, t) },
            parTolerance: 1,
            exploreLimit: 60_000,
          }
        : {
            floors: 2,
            vehicles: { car: 22, truck: 3, bus: 1, motorcycle: 4 },
            walls: 1,
            parTolerance: 1,
            ...(level % 3 === 0 ? { routeFloors: 1 } : { playerUpstairs: true }),
            exploreLimit: 80_000,
            solveLimit: 100_000,
          },
  },
  {
    name: 'Tow trucks',
    first: 81,
    last: 100,
    par: [9, 14],
    settings: (_t, level) =>
      level <= 88
        ? {
            floors: 1,
            vehicles: { car: 7, truck: 1, motorcycle: 2, tow: 2 },
            parTolerance: 1,
            require: ['tow'],
            exploreLimit: 60_000,
          }
        : {
            floors: 2,
            vehicles: { car: 20, truck: 2, motorcycle: 3, tow: 3 },
            walls: 1,
            parTolerance: 1,
            require: ['tow'],
            ...(level % 3 === 0 ? { routeFloors: 1 } : { playerUpstairs: true }),
            exploreLimit: 80_000,
            solveLimit: 100_000,
          },
  },
  {
    name: 'Three floors, cranes, everything',
    first: 101,
    last: 120,
    par: [10, 14],
    settings: (t, level) => {
      const base = {
        floors: 3,
        vehicles: { car: 26, truck: 3, bus: 1, motorcycle: 4, tow: 2 },
        walls: 1,
        floorProductLimit: 30_000,
        exploreLimit: 80_000,
      };
      // Every other level has one crane, which the solution must need. The crane cuts a lot
      // of moves, so those levels aim lower and take a wider par range.
      if (level % 2 === 0) {
        return { ...base, routeFloors: 2, cranes: 1, parTolerance: 2, solveLimit: 250_000, targetParOverride: lerp(7, 10, t) };
      }
      return {
        ...base,
        parTolerance: 1,
        solveLimit: 100_000,
        ...(level % 4 === 1 ? { routeFloors: 3, playerUpstairs: true } : { routeFloors: 2 }),
      };
    },
  },
];

/** Generator settings for every level in the pack, in order. */
export function planLevel(level: number): { section: Section; settings: GeneratorSettings } {
  const section = SECTIONS.find((s) => level >= s.first && level <= s.last);
  if (!section) throw new Error(`level ${level} is not in the pack`);
  const t = section.last === section.first ? 0 : (level - section.first) / (section.last - section.first);
  const { targetParOverride, ...settings } = section.settings(t, level);
  return { section, settings: { ...settings, targetPar: targetParOverride ?? lerp(section.par[0], section.par[1], t) } };
}
