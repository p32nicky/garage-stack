# Progress

## Session 1 — Core rules, solver, tests ✅

**Setup:** Vite + TypeScript (strict) + Vitest. Scripts: `npm run dev`, `npm test`, `npm run typecheck`, `npm run build`.
`src/main.ts` is a placeholder page that solves a demo level and prints it as text; Session 3 replaces it.

### What's in `src/core` (no Three.js)
| File | Purpose |
|---|---|
| `geometry.ts` | Directions (`up/down/left/right`, y grows downward), axes, opposites |
| `types.ts` | Level JSON format (`LevelDef`), runtime state (`GameState`), moves (`SlideMove`, `CraneMove`), vehicle lengths |
| `level.ts` | `compileLevel(def)` validates a level and builds lookup tables. Throws `LevelError` with a readable message |
| `state.ts` | Occupancy grid, `vehicleCells`, `isSolved`, `stateKey` |
| `moves.ts` | `successors` (all legal moves), `movesForVehicle` (for the UI), `applyMove`, `hitchedIndex` |
| `solver.ts` | `solve` (BFS, minimum moves, `maxStates` cap) and `hint` |
| `debug.ts` | `toAscii` text picture of a board (P = player, # = wall, E = exit) |
| `random.ts` | Seeded random numbers (`createRng`), added in Session 2 |
| `generator.ts` | Level generator, added in Session 2 (see below) |

### Rules as implemented (decisions made this session)
- **Vehicle position** = the covered cell with the smallest x/y, plus `facing` (nose direction). Axis comes from `facing`.
- **Lengths:** motorcycle 1, car/player 2, truck/bus 3, **tow truck 2**.
- **Exit:** an edge cell on floor 0 plus outward direction. The player wins as soon as any of its cells covers the exit cell (the drive-off is just animation).
- **Ramps:** join two edge cells on different floors; both ends must be on the same axis. Sliding out of one end enters the other end heading inward, so a car can go left down a ramp and come out heading right downstairs. **A vehicle can't stop part-way through a ramp**; every resting position is fully on one floor. Facing is updated after a ramp so the nose stays at the front.
- **Tow truck:** if a vehicle sits directly behind its rear, on the same floor and axis, it is hitched. Driving forward drags it along; reversing is blocked by it. The tow can drag any vehicle, including the player. The hitch only counts when both start on the same floor; once hitched, the pair can drive through a ramp together.
- **Crane:** each use costs one from `cranesLeft`. Lifts any non-player vehicle to any free spot on the same floor, keeping its orientation.
- **One move** = one slide (any distance) or one crane drop. Par = minimum number of moves.

### Tests (39 passing)
`tests/core/rules.test.ts` covers validation, sliding, blocking, winning, ramps (both directions, no straddling), tow trucks, crane and the debug view.
`tests/core/solver.test.ts` covers hand-made levels with known par (1, 0, 3, ramp 2, tow 2 vs car 3, crane 2), unsolvable detection, the state cap, hints, and a two-floor level with every vehicle type (par 6). Every solution is replayed move by move to prove it wins.

### Notes for Session 2 (generator)
- **Crane levels are expensive to solve.** The busy two-floor test level takes ~73k states / ~2s without a crane but ~850k states / ~20s with one, because every drop position multiplies the search. Suggestions: keep crane levels small (few vehicles, single crane), always pass `maxStates` in the generator, and treat `truncated: true` as "reject this layout".
- **Solver speed** is roughly 30k states/second in Node. Fine for verifying levels; the generator will want to reject big layouts early. Possible speed-ups if needed: numeric state keys, reusing occupancy buffers, avoiding array allocation in `slideSuccessors`.
- **In-game hints (Session 6):** solving from scratch on a phone could be slow for crane levels. Plan: ship each level's optimal solution in its JSON; if the player is still on that path, give the next stored move, otherwise run `solve` with a `maxStates` cap.
- `LevelDef.par` exists but is not filled in yet; the generator should write it.

## Session 2 — Level generator and level pack ✅

**New:** `npm run levels` regenerates the pack (about 22 minutes on 4 cores; `--sections 2,5` redoes only some sections and keeps the rest). Output is deterministic: each level uses fixed seeds.

### Files
| File | Purpose |
|---|---|
| `src/core/random.ts` | `createRng(seed)` (mulberry32), `randInt`, `pick`, `shuffle` |
| `src/core/generator.ts` | `generateLevel(settings, options)`, plus the building blocks: `randomLayout`, `exploreStates`, `distancesToGoal`, `floorStateCount`, `canonicalKey`, `pathKeys`, `featuresUsed`, `independentMoves`, `rateDifficulty` |
| `scripts/pack-plan.ts` | Settings for each of the 5 sections (floors, vehicles, target par range) |
| `scripts/generate-pack.ts` | Runs the generator on worker processes, removes duplicates across the pack, sorts each section by par, writes `src/levels/pack/001.json`…`120.json` |
| `src/levels/index.ts` | `LEVELS` / `getLevel(n)`: the pack loaded with `import.meta.glob`, ready for Session 3 |
| `tests/core/generator.test.ts` | Generator unit tests (14) |
| `tests/levels/pack.test.ts` | Every shipped level: solvable, stored par equals the solver's par, stored solution replays to a win; no duplicates; par rises through each section; each section follows CLAUDE.md |

### How the generator works
1. **Random layout.** Exit on a random edge of floor 0. Upper floors are chained by ramps on the exit's axis so the player can drive down to the exit lane. The player starts **one move from the exit** with its lanes clear, so a win is always reachable. Blockers fill the rest. On multi-floor layouts, loose floors get extra vehicles until each floor's own position count fits its share of `floorProductLimit`.
2. **Explore** every position reachable from that layout (up to `exploreLimit`) and compute each one's exact distance to a win with one backwards search from all solved positions.
3. **Pick a start** at the target par. The hardest positions are found directly instead of hoping a random layout is hard.
4. **Verify** with `solve` from scratch, then reject the pick if:
   - its par is off target, or below 2 (trivial);
   - it's a **sweep**: more than half its solution moves were already legal at the start (each blocker just shifts once);
   - its solution doesn't use a required feature (ramp on multi-floor levels, tow in 81–100, crane on crane levels);
   - on crane levels, the crane doesn't make the level shorter;
   - the solver needs more than `solveLimit` states;
   - it's a **duplicate**: any position on its solution matches any position on an existing level's solution. Positions are compared ignoring vehicle ids, truck vs bus, and mirror images, so this also catches one level being a later stage of another.
5. **Grade:** `difficulty = par + log2(states the solver explored) / 2`, stored in the JSON.

### Level format additions (`LevelDef`)
- `par`: now filled in.
- `difficulty`: generator score, higher is harder.
- `solution`: one optimal move list (`par` moves). **Use this for hints in Session 6:** if the player is still on the stored path, give the next stored move; otherwise run `solve`.

### The pack
| Levels | Content | Par |
|---|---|---|
| 1–20 | 1 floor, cars only (4–13 vehicles) | 2 → 11 |
| 21–50 | 2 floors, cars only. Player starts upstairs in 2/3 of the levels; in the rest, blockers have to drive up the ramp | 6 → 12 |
| 51–80 | Motorcycles, trucks and buses; 51–62 one floor, 63–80 two floors | 7 → 14 |
| 81–100 | Tow trucks (the solution always tows); 81–88 one floor, 89–100 two floors | 8 → 14 |
| 101–120 | 3 floors, everything; even-numbered levels have 1 crane, which the solution needs | 5 → 14 |

Within each section, levels are sorted by par, then by difficulty score. Par drops at the start of each section, where a new mechanic is introduced, and climbs again; every section ends at least as hard as the previous one. Crane levels aim lower (par 5–10) because the crane removes many moves, so 101–120 interleaves short crane levels with longer ones.

### Engine changes
- `stateKey` now packs each vehicle into one character, built in a single call. Together with a tighter `slideSuccessors` loop, the solver runs about 2.6× faster (~25k states/s on multi-floor levels). Keys are no longer human-readable.
- Dev dependencies added: `tsx` (runs the script) and `@types/node`. `tsconfig` now includes `scripts/`.

### Tests (182 passing, ~1m40s)
The pack test re-solves all 120 levels; most take under 1s. The slowest are the three-floor crane levels, up to ~11s each.

### Notes for later sessions
- **Hints on phones:** three-floor crane levels take the solver up to ~250k states (~10s in Node). Use the stored `solution` first, as planned above.
- **Multi-floor generation** was the hard part: floors multiply each other's positions. That's why floors are tightened, and why `routeFloors` keeps the player's route to at most 2–3 floors with the rest packed. Raising vehicle counts or loosening limits in `pack-plan.ts` can make sections fail to generate or slow down the tests.
- Tow levels use 2–3 tow trucks; it's random which vehicle gets hitched.
- **Not done (later sessions):** rendering, UI, Android project (Session 7).
