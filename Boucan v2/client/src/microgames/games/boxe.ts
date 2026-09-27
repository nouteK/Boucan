import type { TypedPayload } from '@boucan/shared';
import { box, g, INK, outlineText, poly, slam, star } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { Actor } from '../common';
import { bomb, keyCap } from '../props';

/**
 * DUEL — BOXE ! Everyone is paired in a ring (an odd player boxes the
 * training bomb). Tap the right side (→ / Space) to punch, hold the left side
 * (← / ↓) to guard — the guard wears out and breaks. Three hearts; K.O.
 * loses, at the bell fewer hearts loses. Your fight is in front.
 */
interface Boxer {
  id: string | null;
  hp: number;
  guard: boolean;
  punchAt: number | null;
  stunned: boolean;
  broken: boolean;
  stamina: number;
}
interface Fight {
  a: Boxer;
  b: Boxer;
  done: boolean;
  loser: 'a' | 'b' | null;
}
interface State {
  fightAt: number;
  fights: Fight[];
}

const GROUND = 600;
const RING_W = 560;

export default defineMicrogame({
  id: 'boxe',
  verb: 'BOXE !',
  create(ctx) {
    const actors = new Map(ctx.players.map((p) => [p.id, new Actor(p, 'box')]));
    const seenPunch = new Map<string, number>();
    const pows: { fight: number; x: number; t: number; block: boolean }[] = [];
    let state: State | null = null;
    let guarding = false;
    const setGuard = (on: boolean) => {
      if (on === guarding) return;
      guarding = on;
      ctx.send({ type: 'guard', on });
    };
    const punch = () => {
      if (!state || ctx.serverNow() < state.fightAt) return;
      ctx.send({ type: 'punch' });
    };
    return {
      input(e) {
        if (e.type === 'down') {
          if (e.x !== null && e.x < 640) setGuard(true);
          else punch();
        } else if (e.type === 'up') setGuard(false);
        else if (e.type === 'key' && !e.repeat) {
          if (e.key === 'left' || e.key === 'down') setGuard(true);
          else punch();
        } else if (e.type === 'keyup' && (e.key === 'left' || e.key === 'down')) setGuard(false);
      },
      onState(s) {
        state = s as State;
      },
      onEvent(e: TypedPayload) {
        if (!state) return;
        const fight = state.fights[Number(e.fight)];
        const mine = fight && (fight.a.id === ctx.me.id || fight.b.id === ctx.me.id);
        if (e.type === 'bell') ctx.sfx('go');
        if (e.type === 'hit') {
          pows.push({ fight: Number(e.fight), x: e.playerId === fight?.a.id ? -1 : 1, t: 0, block: false });
          if (mine) ctx.sfx('hit');
          if (e.playerId === ctx.me.id) ctx.shake(200);
        }
        if (e.type === 'block') {
          pows.push({ fight: Number(e.fight), x: 0, t: 0, block: true });
          if (mine) ctx.sfx('block');
        }
        if (e.type === 'ko' && mine) ctx.sfx('boom');
      },
      update(dt) {
        for (let i = pows.length - 1; i >= 0; i--) if ((pows[i]!.t += dt) > 260) pows.splice(i, 1);
        if (!state) return;
        for (const f of state.fights) {
          for (const [b, side] of [[f.a, 'a'], [f.b, 'b']] as const) {
            if (!b.id) continue;
            const a = actors.get(b.id);
            if (!a) continue;
            if (b.punchAt !== null && seenPunch.get(b.id) !== b.punchAt) {
              seenPunch.set(b.id, b.punchAt);
              a.force('box_punch');
            } else if (f.done) a.set(f.loser === side ? 'box_hurt' : 'box_win');
            else if (b.stunned || b.broken) a.set('box_hurt');
            else if (b.guard) a.set('box_guard');
            else if (a.pose !== 'box_punch' || a.t > 300) a.set('box');
            a.update(dt);
          }
        }
      },
      draw(t) {
        sceneBg('ville', GROUND - 190);
        const c = g();
        c.fillStyle = 'rgba(35,28,56,.35)';
        c.fillRect(0, 0, 1280, 720);
        if (!state) return;
        const fights = state.fights;
        const mineIdx = Math.max(0, fights.findIndex((f) => f.a.id === ctx.me.id || f.b.id === ctx.me.id));
        const others = fights.map((_, i) => i).filter((i) => i !== mineIdx);
        const drawRing = (i: number, cx: number, gy: number, k: number, dim: boolean) => {
          const f = fights[i]!;
          c.save();
          c.translate(cx, gy);
          c.scale(k, k);
          if (dim) c.filter = 'brightness(.8) saturate(.85)';
          poly([[-RING_W / 2, 0], [RING_W / 2, 0], [RING_W / 2 - 30, -50], [-RING_W / 2 + 30, -50]], '#3a6fd8', 6);
          for (const s of [-1, 1]) box(s * (RING_W / 2 - 30) - 7, -260, 14, 215, '#ddd', 5);
          ['#ff4f7b', '#fff', '#3fb8ff'].forEach((col, r) => {
            c.strokeStyle = INK;
            c.lineWidth = 9;
            c.beginPath();
            c.moveTo(-RING_W / 2 + 30, -230 + r * 55);
            c.lineTo(RING_W / 2 - 30, -230 + r * 55);
            c.stroke();
            c.strokeStyle = col;
            c.lineWidth = 5;
            c.stroke();
          });
          const h = 250;
          for (const [b, dir] of [[f.a, -1], [f.b, 1]] as const) {
            const lunge = b.punchAt !== null && ctx.serverNow() - b.punchAt < 200 ? -dir * 18 : 0;
            const x = dir * 115 + lunge;
            if (b.id) actors.get(b.id)?.draw(x, -40, h, { flip: dir > 0 });
            else bomb(x, -40, 200, 3 - Math.max(1, b.hp), dir > 0, b.punchAt !== null ? dir * -0.25 : Math.sin(t / 200) * 0.08);
            for (let hh = 0; hh < 3; hh++) {
              const hx = x - 36 + hh * 36;
              const hy = -h - 60;
              c.fillStyle = hh < b.hp ? '#ff3b5c' : 'rgba(255,255,255,.25)';
              c.strokeStyle = INK;
              c.lineWidth = 4;
              c.beginPath();
              c.moveTo(hx, hy + 10);
              c.bezierCurveTo(hx - 22, hy - 8, hx - 10, hy - 24, hx, hy - 12);
              c.bezierCurveTo(hx + 10, hy - 24, hx + 22, hy - 8, hx, hy + 10);
              c.fill();
              c.stroke();
            }
            box(x - 40, -h - 38, 80, 10, INK, 0, 3);
            box(x - 38, -h - 36, 76 * b.stamina, 6, b.broken ? '#ff5a4a' : '#7dff9b', 0, 2);
            const p = b.id ? ctx.players.find((pp) => pp.id === b.id) : null;
            outlineText(p ? (p.isMe ? 'TOI' : p.nickname) : 'BOMBE', x, -h - 92, 22, p ? (p.isMe ? '#ffe04a' : p.color) : '#ff6b6b', 'center', 5);
          }
          for (const p of pows) {
            if (p.fight !== i) continue;
            if (p.block) outlineText('BLOCK', 0, -230, 30, '#bfe6ff');
            else star(p.x * 115, -190, p.t / 260);
          }
          if (f.done && f.loser) slam('K.O. !', 300, '#ffe04a', 0, -330, 90);
          c.restore();
        };
        others.forEach((i, k) => drawRing(i, others.length > 1 ? 330 + (k % 3) * 310 : 1000, 420 + Math.floor(k / 3) * 30, 0.5, true));
        drawRing(mineIdx, others.length ? 560 : 640, GROUND + 60, others.length ? 1.05 : 1.1, false);
        // Controls and the opening countdown.
        const me = fights[mineIdx];
        if (me && (me.a.id === ctx.me.id || me.b.id === ctx.me.id) && !me.done) {
          keyCap(90, 640, 'left', guarding ? 1 : 0.8, guarding ? 'ok' : null);
          outlineText('GARDE', 90, 700, 20, '#fff', 'center', 4);
          keyCap(1190, 640, 'right', 0.8);
          outlineText('FRAPPE', 1190, 700, 20, '#fff', 'center', 4);
        }
        const toBell = state.fightAt - ctx.serverNow();
        if (toBell > 0) {
          const n = Math.ceil(toBell / 500);
          if (n <= 3) slam(String(n), 500 - (toBell % 500), '#fff', 640, 400, 180);
        } else if (toBell > -500) slam('BOXE !', -toBell, '#ffe04a', 640, 400, 140);
      },
    };
  },
});
