import type { Rng } from '@boucan/shared';
import { box, g, INK, outlineText } from '../../engine/draw';
import type { ArrowKey } from '../../engine/input';
import { defineMicrogame } from '../api';
import { byLevel, hero } from '../common';

/**
 * CACHE-TOI DES LASERS ! — a lab wall of lasers, row by row, some firing from
 * both sides: before they fire, hide behind METAL blocks (glass does not
 * stop them). Move with the arrows / ZQSD, or hold your finger where you
 * want to go.
 */
const ROWS = 8;
const TOP = 30;
const ROW_H = 62;
const COL_W = 80;
const X0 = 160;
const FIRE_MS = 650;
const SPEED = 0.45;
const BOTTOM = TOP + ROWS * ROW_H;

interface Block {
  r: number;
  c: number;
  metal: boolean;
}
interface Wall {
  blocks: Block[];
  /** Rows that also have an emitter on the right. */
  both: boolean[];
}

const bx = (b: Block) => X0 + b.c * COL_W;
const rowOf = (y: number) => Math.floor((y - TOP) / ROW_H);
const START = { x: 640, y: TOP + ROW_H * 3.5 + 27 };

function blocked(w: Wall, x: number, y: number): boolean {
  return w.blocks.some((b) => {
    const top = TOP + b.r * ROW_H;
    return x > bx(b) - 22 && x < bx(b) + COL_W + 22 && y > top - 8 && y < top + ROW_H + 8;
  });
}

/** Safe from the lasers of row r at x: metal on the left, and on the right when that row fires both ways. */
function sheltered(w: Wall, x: number, r: number): boolean {
  const metal = w.blocks.filter((b) => b.r === r && b.metal);
  const left = metal.some((b) => bx(b) + COL_W <= x + 6);
  const right = !w.both[r] || metal.some((b) => bx(b) >= x - 6);
  return left && right;
}

function wall(rng: Rng): Wall {
  const both = Array.from({ length: ROWS }, () => rng.chance(0.4));
  const blocks: Block[] = [];
  const runs = rng.int(4, 6);
  for (let i = 0; i < runs; i++) {
    const r = rng.int(1, ROWS - 2);
    const len = rng.int(2, 5);
    const c0 = rng.int(1, 10 - len);
    for (let c = c0; c < c0 + len; c++) if (!blocks.some((b) => b.r === r && b.c === c)) blocks.push({ r, c, metal: rng.chance(0.55) });
  }
  return { blocks, both };
}

/** A shelter can be reached from the start (breadth-first search on a 20 px grid). */
function solvable(w: Wall): boolean {
  if (blocked(w, START.x, START.y)) return false;
  const seen = new Set([`${START.x},${START.y}`]);
  const queue: [number, number][] = [[START.x, START.y]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    if (sheltered(w, x, rowOf(y)) && Math.abs(((y - TOP) % ROW_H) - ROW_H / 2) < 18) return true;
    for (const [dx, dy] of [[20, 0], [-20, 0], [0, 20], [0, -20]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 40 || nx > 1240 || ny < TOP + 20 || ny > BOTTOM - 20) continue;
      const key = `${nx},${ny}`;
      if (seen.has(key) || blocked(w, nx, ny)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return false;
}

export default defineMicrogame({
  id: 'laser',
  verb: 'CACHE-TOI DES LASERS !',
  create(ctx) {
    const me = hero(ctx, 'run');
    const warn = byLevel(ctx, 3000, 2750, 2500);
    let w = wall(ctx.rng);
    for (let i = 0; i < 60 && !solvable(w); i++) w = wall(ctx.rng);
    let x = START.x;
    let y = START.y;
    let face = false;
    let clock = 0;
    let fired = false;
    let hit = false;
    const keys = new Set<ArrowKey>();
    let target: { x: number; y: number } | null = null;
    return {
      input(e) {
        if (e.type === 'key') keys.add(e.key);
        else if (e.type === 'keyup') keys.delete(e.key);
        else if ((e.type === 'down' || (e.type === 'move' && e.pressed)) && e.x !== null && e.y !== null) target = { x: e.x, y: e.y - 40 };
        else if (e.type === 'up') target = null;
      },
      update(dt, t) {
        clock = t;
        me.update(dt);
        if (hit) return;
        let dx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
        let dy = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
        if (!dx && !dy && target) {
          dx = Math.abs(target.x - x) > 6 ? Math.sign(target.x - x) : 0;
          dy = Math.abs(target.y - y) > 6 ? Math.sign(target.y - y) : 0;
        }
        if (!fired) {
          const nx = Math.max(40, Math.min(1240, x + dx * SPEED * dt));
          const ny = Math.max(TOP + 20, Math.min(BOTTOM - 20, y + dy * SPEED * dt));
          if (!blocked(w, nx, y)) x = nx;
          if (!blocked(w, x, ny)) y = ny;
          if (dx) face = dx < 0;
        }
        if (t >= warn && !fired) {
          fired = true;
          ctx.shake(160);
          ctx.sfx('boom');
          if (!sheltered(w, x, rowOf(y))) {
            hit = true;
            me.force('hurt');
            ctx.lose();
          }
        }
        if (fired && !hit && t >= warn + FIRE_MS && !ctx.outcome) ctx.win();
      },
      timeout: () => (hit ? 'failure' : 'success'),
      draw(t) {
        const c = g();
        c.fillStyle = '#d9dde6';
        c.fillRect(0, 0, 1280, 720);
        c.strokeStyle = 'rgba(120,130,150,.35)';
        c.lineWidth = 4;
        for (let lx = 0; lx < 1280; lx += 210) {
          c.beginPath();
          c.moveTo(lx, 0);
          c.lineTo(lx, 720);
          c.stroke();
        }
        const firing = fired && clock < warn + FIRE_MS;
        const charge = Math.min(1, clock / warn);
        for (let r = 0; r < ROWS; r++) {
          const ly = TOP + r * ROW_H + ROW_H / 2;
          const metal = w.blocks.filter((b) => b.r === r && b.metal);
          for (const d of w.both[r] ? [1, -1] : [1]) {
            const from = d > 0 ? 0 : 1280;
            let to = d > 0 ? 1280 : 0;
            for (const b of metal) to = d > 0 ? Math.min(to, bx(b)) : Math.max(to, bx(b) + COL_W);
            const x0 = Math.min(from, to);
            const len = Math.abs(to - from);
            if (firing) {
              c.fillStyle = 'rgba(255,80,120,.35)';
              c.fillRect(x0, ly - 20, len, 40);
              c.fillStyle = '#fff0f4';
              c.fillRect(x0, ly - 9, len, 18);
            } else if (!fired) {
              c.fillStyle = `rgba(255,60,90,${0.15 + 0.35 * charge * (0.5 + 0.5 * Math.sin(t / (90 - 60 * charge)))})`;
              c.fillRect(x0, ly - 2 - charge * 4, len, 4 + charge * 8);
            }
            box(d > 0 ? -10 : 1210, ly - 23, 80, 46, '#2a2d33', 4, 8);
            c.fillStyle = '#c0203a';
            c.fillRect(d > 0 ? 62 : 1206, ly - 19, 12, 38);
          }
        }
        for (const b of w.blocks) {
          const x1 = bx(b);
          const y1 = TOP + b.r * ROW_H;
          if (b.metal) {
            c.fillStyle = '#3a3d44';
            c.fillRect(x1, y1, COL_W, ROW_H);
            c.strokeStyle = 'rgba(255,255,255,.18)';
            c.lineWidth = 8;
            for (let k = -1; k < 3; k++) {
              c.beginPath();
              c.moveTo(x1 + k * 30, y1 + ROW_H);
              c.lineTo(x1 + k * 30 + ROW_H, y1);
              c.stroke();
            }
          } else {
            c.fillStyle = 'rgba(190,230,255,.6)';
            c.fillRect(x1, y1, COL_W, ROW_H);
            c.strokeStyle = 'rgba(255,255,255,.8)';
            c.lineWidth = 4;
            c.beginPath();
            c.moveTo(x1 + 14, y1 + ROW_H - 12);
            c.lineTo(x1 + COL_W - 14, y1 + 12);
            c.stroke();
          }
          c.strokeStyle = b.metal ? INK : '#2aa0b0';
          c.lineWidth = 4;
          c.strokeRect(x1, y1, COL_W, ROW_H);
        }
        me.draw(x, y + 40, 90, { flip: face, shadow: false, rot: Math.sin(t / 300) * 0.05 });
        if (!fired && t > 950) {
          outlineText(`TIR DANS ${Math.ceil((warn - clock) / 1000)}…`, 640, BOTTOM + 44, 40, '#ff3b5c', 'center', 7);
          outlineText('le métal protège, pas le verre !', 640, BOTTOM + 88, 24, '#fff', 'center', 5);
        }
        if (hit) outlineText('GRILLÉ !', 640, 330, 80, '#ff3b5c', 'center', 9);
      },
    };
  },
});
