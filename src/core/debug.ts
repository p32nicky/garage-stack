import { cellIndex, type Level } from './level';
import { buildOccupancy, EMPTY, WALL } from './state';
import type { GameState } from './types';

const SYMBOLS = 'ABCDFGHIJKLMNOQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Single-letter ids are drawn as themselves; longer ids get a letter by position. */
function symbolFor(id: string, index: number): string {
  return id.length === 1 ? id : (SYMBOLS[index % SYMBOLS.length] ?? '?');
}

/**
 * Text picture of a state, one block per floor (top floor first).
 * P = player, # = wall, E = exit, other letters = vehicles.
 */
export function toAscii(level: Level, state: GameState = level.initial): string {
  const occ = buildOccupancy(level, state);
  const blocks: string[] = [];
  for (let f = level.floorCount - 1; f >= 0; f--) {
    const lines = [`floor ${f}`];
    for (let y = 0; y < (level.heights[f] ?? 0); y++) {
      let line = '';
      for (let x = 0; x < (level.widths[f] ?? 0); x++) {
        const c = cellIndex(level, f, x, y);
        const o = occ[c] ?? EMPTY;
        if (o === WALL) line += '#';
        else if (o === level.playerIndex) line += 'P';
        else if (o >= 0) line += symbolFor(level.ids[o] ?? '', o);
        else line += c === level.exitCell ? 'E' : '.';
      }
      lines.push(line);
    }
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n');
}
