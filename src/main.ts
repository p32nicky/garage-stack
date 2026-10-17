// Placeholder until the 3D renderer arrives (Session 3): shows a demo level solved by the core engine.
import { compileLevel, solve, toAscii, type LevelDef } from './core';

const demo: LevelDef = {
  id: 'demo',
  floors: [{ width: 6, height: 6 }],
  exit: { floor: 0, x: 5, y: 2, dir: 'right' },
  vehicles: [
    { id: 'P', kind: 'player', floor: 0, x: 0, y: 2, facing: 'right' },
    { id: 'A', kind: 'car', floor: 0, x: 3, y: 1, facing: 'up' },
    { id: 'T', kind: 'truck', floor: 0, x: 3, y: 3, facing: 'down' },
    { id: 'B', kind: 'car', floor: 0, x: 2, y: 0, facing: 'right' },
  ],
};

const level = compileLevel(demo);
const result = solve(level);
const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  app.innerHTML = `
    <h1 style="font-family: system-ui, sans-serif">Garage Stack</h1>
    <p style="font-family: system-ui, sans-serif">Core engine running. Demo level par: ${result.par}</p>
    <pre style="font-size: 20px">${toAscii(level)}</pre>
    <ol style="font-family: system-ui, sans-serif">${result.moves
      .map((m) => `<li>${m.type === 'slide' ? `${m.vehicle} ${m.dir} ${m.distance}` : `crane ${m.vehicle}`}</li>`)
      .join('')}</ol>`;
}
