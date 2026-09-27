import { GAME } from '../config';
import { drawCharacter } from '../engine/assets';
import { setContext } from '../engine/draw';

/** Draws a character bust into a small canvas (menus). Returns the canvas. */
export function drawPortrait(canvas: HTMLCanvasElement, characterId: string | null, seat: number, pose: 'idle' | 'win' = 'idle'): HTMLCanvasElement {
  const size = 120;
  if (canvas.width !== size * 2) {
    canvas.width = size * 2;
    canvas.height = size * 2;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.clearRect(0, 0, size, size);
  setContext(ctx);
  drawCharacter(characterId, pose, 0, size / 2, size * 1.02, size * 1.05, { color: GAME.seatColors[seat % GAME.seatColors.length] });
  return canvas;
}

export function portrait(characterId: string | null, seat: number): HTMLCanvasElement {
  return drawPortrait(document.createElement('canvas'), characterId, seat);
}
