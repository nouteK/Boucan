import type { TypedPayload } from '@boucan/shared';
import { circle, g, outlineText, slam, star } from '../../engine/draw';
import { offscreen } from '../../engine/screen';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { Actor } from '../common';
import { gauge, keyCap } from '../props';

/**
 * DUEL — CACHE-CACHE ! One hunter with a torch, everyone else in the dark.
 * Hold the left / right of the screen (or ← →) to move. Prey: hold the middle
 * (or ↓) near a bush to hide — not for long. Hunter: tap the middle (or ↑ /
 * Space) to grab whoever is right in front. Server-simulated; your own
 * movement is predicted locally.
 */
interface PlayerState {
  x: number;
  face: -1 | 1;
  hidden: boolean;
  out: boolean;
  moving: boolean;
  grabbing: boolean;
}
interface State {
  hunter: string;
  world: number;
  spots: number[];
  players: Record<string, PlayerState>;
  result: 'hunter' | 'time' | null;
}

const GROUND = 560;
/** Same speeds as the server (prediction). */
const SPEED = { hunter: 0.52, prey: 0.36 };
const TORCH = 230;
const MY_LIGHT = 240;

/** One darkness layer shared by every round (allocated once, never leaks). */
let darkness: ReturnType<typeof offscreen> | null = null;
function darknessLayer(): ReturnType<typeof offscreen> | null {
  if (typeof document === 'undefined') return null;
  darkness ??= offscreen(1);
  return darkness;
}

export default defineMicrogame({
  id: 'noir',
  verb: 'CACHE-CACHE !',
  create(ctx) {
    const actors = new Map(ctx.players.map((p) => [p.id, new Actor(p, 'idle')]));
    const shownX = new Map<string, number>();
    let state: State | null = null;
    let dir: -1 | 0 | 1 = 0;
    let hiding = false;
    let myX: number | null = null;
    let caughtAt: { id: string; t: number } | null = null;
    let clock = 0;
    let resultAt = -1;
    const move = (d: -1 | 0 | 1) => {
      if (d === dir) return;
      dir = d;
      ctx.send({ type: 'move', dir: d });
    };
    const hide = (on: boolean) => {
      if (on === hiding) return;
      hiding = on;
      ctx.send({ type: 'hide', on });
    };
    const grab = () => {
      ctx.send({ type: 'grab' });
      actors.get(ctx.me.id)?.force('punch');
      ctx.sfx('whoosh');
    };
    return {
      input(e) {
        if (!state || state.result) return;
        const hunter = state.hunter === ctx.me.id;
        if (e.type === 'down') {
          if (e.x === null) {
            if (hunter) grab();
          } else if (e.x < 427) move(-1);
          else if (e.x > 853) move(1);
          else if (hunter) grab();
          else hide(true);
        } else if (e.type === 'up') {
          move(0);
          hide(false);
        } else if (e.type === 'key' && !e.repeat) {
          if (e.key === 'left') move(-1);
          else if (e.key === 'right') move(1);
          else if (e.key === 'down' && !hunter) hide(true);
          else if (hunter) grab();
        } else if (e.type === 'keyup') {
          if ((e.key === 'left' && dir === -1) || (e.key === 'right' && dir === 1)) move(0);
          if (e.key === 'down') hide(false);
        }
      },
      onState(s) {
        const next = s as State;
        if (next.result && !state?.result) resultAt = clock;
        state = next;
      },
      onEvent(e: TypedPayload) {
        if (e.type === 'caught') {
          caughtAt = { id: String(e.playerId), t: clock };
          actors.get(String(e.playerId))?.force('hurt');
          if (e.playerId === ctx.me.id) {
            ctx.sfx('hurt');
            ctx.shake(260);
          } else ctx.sfx('hit');
        }
        if (e.type === 'grab' && e.playerId !== ctx.me.id) actors.get(String(e.playerId))?.force('punch');
      },
      update(dt, t) {
        clock = t;
        if (!state) return;
        for (const [id, p] of Object.entries(state.players)) {
          const a = actors.get(id);
          if (id === ctx.me.id) {
            // Prediction: move with my own input, then converge on the server position.
            myX ??= p.x;
            const speed = id === state.hunter ? SPEED.hunter : SPEED.prey;
            if (!p.out && !p.hidden && !p.grabbing && !state.result) myX = Math.max(60, Math.min(state.world - 60, myX + dir * speed * dt));
            myX += (p.x - myX) * Math.min(1, dt / 250);
            shownX.set(id, myX);
          } else shownX.set(id, (shownX.get(id) ?? p.x) + (p.x - (shownX.get(id) ?? p.x)) * Math.min(1, dt / 100));
          if (!a) continue;
          if (p.out) a.set('hurt');
          else if (p.hidden) a.set('duck');
          else if (p.grabbing) a.set('punch');
          else if (p.moving || (id === ctx.me.id && dir !== 0)) a.set('run');
          else if (a.pose !== 'punch' || a.t > 300) a.set('idle');
          a.update(dt);
        }
      },
      draw(t) {
        const c = g();
        if (!state) {
          c.fillStyle = '#05050f';
          c.fillRect(0, 0, 1280, 720);
          return;
        }
        const s = state;
        const me = s.players[ctx.me.id] ? ctx.me.id : s.hunter;
        const cam = Math.max(0, Math.min(s.world - 1280, (shownX.get(me) ?? 1200) - 640));
        sceneBg('foret', GROUND, cam * 0.5);
        const bush = (x: number) => {
          for (const [dx, dy, r] of [[-50, -30, 50], [0, -60, 62], [50, -30, 50]] as const) circle(x + dx, GROUND + dy, r, '#1f5b4a', 6);
          circle(x - 10, GROUND - 70, 20, '#2b7a62', 0);
        };
        const draw = (id: string, dim: boolean) => {
          const p = s.players[id]!;
          const x = (shownX.get(id) ?? p.x) - cam;
          if (x < -150 || x > 1430) return;
          c.save();
          if (p.out) c.globalAlpha = 0.5;
          if (dim) c.globalAlpha *= 0.85;
          actors.get(id)?.draw(x, GROUND, 216, { flip: p.face < 0 });
          c.restore();
        };
        for (const id of Object.keys(s.players)) if (s.players[id]!.hidden) draw(id, true);
        for (const x of s.spots) bush(x - cam);
        for (const id of Object.keys(s.players)) if (!s.players[id]!.hidden) draw(id, false);
        if (caughtAt && t - caughtAt.t < 300) {
          const p = s.players[caughtAt.id];
          if (p) star((shownX.get(caughtAt.id) ?? p.x) - cam, GROUND - 170, (t - caughtAt.t) / 300);
        }
        // Darkness with two holes: the hunter's torch and your own little light.
        const H = s.players[s.hunter]!;
        const hx = (shownX.get(s.hunter) ?? H.x) - cam;
        const layer = darknessLayer();
        if (layer && !s.result) {
          const d = layer.ctx;
          d.setTransform(1, 0, 0, 1, 0, 0);
          d.globalCompositeOperation = 'source-over';
          d.clearRect(0, 0, 1280, 720);
          d.fillStyle = 'rgba(3,3,14,.96)';
          d.fillRect(0, 0, 1280, 720);
          d.globalCompositeOperation = 'destination-out';
          const light = (x: number, y: number, r: number) => {
            const grd = d.createRadialGradient(x, y, r * 0.35, x, y, r);
            grd.addColorStop(0, 'rgba(0,0,0,1)');
            grd.addColorStop(1, 'rgba(0,0,0,0)');
            d.fillStyle = grd;
            d.beginPath();
            d.arc(x, y, r, 0, Math.PI * 2);
            d.fill();
          };
          light(hx + H.face * 60, GROUND - 120, TORCH);
          const mine = s.players[ctx.me.id];
          if (mine && ctx.me.id !== s.hunter && !mine.out) light((shownX.get(ctx.me.id) ?? mine.x) - cam, GROUND - 120, MY_LIGHT);
          d.globalCompositeOperation = 'source-over';
          c.drawImage(layer.canvas, 0, 0, 1280, 720);
          c.fillStyle = 'rgba(255,240,150,.10)';
          c.beginPath();
          c.moveTo(hx + H.face * 30, GROUND - 150);
          c.lineTo(hx + H.face * 260, GROUND - 260);
          c.lineTo(hx + H.face * 260, GROUND - 10);
          c.closePath();
          c.fill();
        }
        const meP = s.players[ctx.me.id];
        if (meP) outlineText('TOI', (shownX.get(ctx.me.id) ?? meP.x) - cam, GROUND - 250, 24, '#ffe04a');
        if (s.hunter !== ctx.me.id) outlineText('🔦', hx, GROUND - 250, 28, '#fff');
        const left = Object.entries(s.players).filter(([id, p]) => id !== s.hunter && !p.out).length;
        outlineText(`Proies restantes : ${left}`, 30, 70, 26, '#fff', 'left', 6);
        gauge(440, 60, 400, 12, 1 - (ctx.serverNow() - ctx.activeAt) / ctx.duration, '#ffe04a');
        const hunterMe = s.hunter === ctx.me.id;
        if (t < 1800 && !s.result) {
          slam(hunterMe ? 'TU ES LE CHASSEUR !' : 'CACHE-TOI !', t, hunterMe ? '#ff6b6b' : '#7dff9b', 640, 390, 70, 900);
        }
        if (!s.result && meP && !meP.out) {
          keyCap(90, 640, 'left', dir === -1 ? 1 : 0.8, dir === -1 ? 'ok' : null);
          keyCap(1190, 640, 'right', dir === 1 ? 1 : 0.8, dir === 1 ? 'ok' : null);
          keyCap(640, 640, hunterMe ? 'up' : 'down', hiding ? 1 : 0.8, hiding ? 'ok' : null);
          outlineText(hunterMe ? 'attrape' : 'cache-toi (buisson)', 640, 700, 20, '#fff', 'center', 4);
        }
        if (s.result) slam(s.result === 'hunter' ? 'TOUS ATTRAPÉS !' : 'LA NUIT EST FINIE !', t - resultAt, '#ffe04a', 640, 250, 80, 1000);
      },
    };
  },
});
