# Garage Stack — cloud session prompts

Run these in order, one per cloud session. Between sessions: open the result, try it, then merge the pull request before starting the next one (the cloud session clones what's on GitHub, not your computer).

Check your remaining credit after sessions 1 and 2 to see what a session costs, then adjust. Keep roughly 20% in reserve for bug fixes.

---

## Session 1 — Core rules, solver, tests (no graphics)
Read CLAUDE.md. Set up the project (Vite + TypeScript + Vitest). Implement src/core: the board model (multi-floor grids, vehicles of length 1–3, walls, exit gate, ramps), legal move generation, applying moves, and win detection. Implement a BFS solver that returns the minimum move solution. Include tow truck and crane rules now so the model doesn't need rewriting later. Write thorough unit tests, including a few hand-made levels with known solutions. No rendering. Create PROGRESS.md.

## Session 2 — Level generator and level pack
Read CLAUDE.md and PROGRESS.md. Build a level generator in src/core that creates random layouts for given settings (floors, vehicle types, target difficulty), validates them with the solver, and rejects trivial or duplicate ones. Generate the 120-level pack described in CLAUDE.md as JSON files, with a smooth difficulty curve. Add a script to regenerate the pack and a test that every shipped level is solvable and its stored par is correct.

## Session 3 — 3D board, single floor, playable in browser
Read CLAUDE.md and PROGRESS.md. Build src/render with Three.js: low-poly procedural garage floor, walls, exit gate, and vehicles (distinct colors and shapes per type, red player car). Implement swipe-to-slide with smooth animation, using src/core for all rules. Load levels 1–20 from the pack. Add a basic win screen. Must run at 60fps and in portrait on a phone-sized browser window.

## Session 4 — Multiple floors, ramps, camera
Read CLAUDE.md and PROGRESS.md. Render stacked floors with ramps, animate vehicles driving through ramps between floors, add touch camera rotate/zoom and a floor-focus button that fades upper floors. Make levels 21–50 and 101–120 playable. Keep performance on target.

## Session 5 — Special vehicles
Read CLAUDE.md and PROGRESS.md. Add visuals and interactions for motorcycles, trucks, tow trucks (show the hitch and animate the dragged vehicle), and the crane power-up (tap crane, tap vehicle, tap destination, with a lift animation). Make all 120 levels playable.

## Session 6 — Game UI and progression
Read CLAUDE.md and PROGRESS.md. Add main menu, level select with stars and locks, move counter, undo, restart, 3-star results screen, hints from the solver with daily refills, settings (sound, haptics), saved progress, and simple sound effects. First-time tutorial overlay for levels 1–3. Clean, bright, readable style.

## Session 7 — Android build
Read CLAUDE.md and PROGRESS.md. Add Capacitor with an Android project. Use Capacitor Preferences for saved progress and Haptics for vibration. Lock to portrait, handle the back button, add an app icon and splash screen made from in-game style art. Add a GitHub Actions workflow that builds a debug APK on every push and a signed release AAB when keystore secrets are present. Document in README how to install the debug APK on a phone and how to add the signing secrets.

## Session 8 — Bug fixes and polish
Read CLAUDE.md and PROGRESS.md. Here is what I found testing on my phone: [PASTE YOUR LIST]. Fix these, then do a polish pass on animations, feel of swipes, and loading time.

## Session 9 — Store assets
Read CLAUDE.md and PROGRESS.md. Create: a 512x512 icon, a 1024x500 feature graphic, a script that captures phone screenshots of several levels, a Google Play store listing (title, short description, full description), and a simple privacy policy page (the game collects no personal data). Put them in /store.
