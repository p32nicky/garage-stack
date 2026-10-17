# Garage Stack (working title)

A 3D parking-jam puzzle game for Android. The player's car is trapped in a multi-story parking garage and must be driven out by sliding other vehicles out of the way.

## Tech stack (do not change without asking)
- TypeScript + Vite
- Three.js for 3D rendering
- Vitest for tests
- Capacitor for the Android build
- GitHub Actions for automated APK/AAB builds
- No paid or licensed assets. All models are built from simple procedural geometry (low-poly boxes, rounded shapes). Sounds are generated or CC0 only.

## Core rules
- Each floor is a grid (default 6x6).
- Vehicles occupy a straight line of cells and only move forward/backward along their own axis:
  - Motorcycle: 1 cell
  - Car: 2 cells
  - Truck / Bus: 3 cells
- Vehicles cannot pass through each other or walls.
- The player car (red) wins by reaching the exit gate on the ground floor.
- Ramps connect a lane at the edge of one floor to a lane on the floor above or below. A vehicle that slides through a ramp continues onto the connected floor, keeping its orientation, if the destination cells are free.
- One move = sliding one vehicle any distance in one direction.

## Special vehicles (introduced gradually)
- Tow truck: when it moves, it drags the vehicle hitched directly behind it.
- Crane (power-up, max 1 per level when available): lift any one vehicle and drop it on any free space that fits it on the same floor.
- Motorcycle: 1 cell, fits gaps nothing else can.

## Levels
- Levels are data (JSON), not code.
- A solver (breadth-first search over board states) checks every level is solvable and computes its minimum move count ("par").
- A generator creates random layouts, keeps only solvable ones, and grades difficulty by par and branching.
- Ship at least 120 levels:
  - 1–20: single floor, cars only (tutorial curve)
  - 21–50: two floors with ramps
  - 51–80: introduce motorcycles and trucks
  - 81–100: tow trucks
  - 101–120: three floors, crane levels, everything combined

## Player features
- Swipe a vehicle to slide it
- Undo, restart
- Move counter and 3-star rating (3 stars = par, 2 = par + 30%, 1 = solved)
- Hint: shows the next optimal move from the solver (limited, e.g. 3 refills per day)
- Level select with stars and locks
- Progress saved on device
- Camera: rotate/zoom with touch; button to switch floor focus (upper floors fade semi-transparent)
- Sound and haptics on/off

## Quality bar
- Smooth 60fps on a mid-range Android phone; keep draw calls low (instancing / merged geometry)
- Portrait orientation, works on small and large screens
- Every rules change must keep tests passing
- Keep code modular: `src/core` (rules, solver, generator — no Three.js imports), `src/render`, `src/ui`, `src/platform`

## Working agreements for Claude sessions
- Read this file first.
- Do only the phase asked for in the session prompt; do not start the next phase.
- Run tests before finishing.
- Commit with clear messages and summarize what was done and anything left unresolved in `PROGRESS.md`.
