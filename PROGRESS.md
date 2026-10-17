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
