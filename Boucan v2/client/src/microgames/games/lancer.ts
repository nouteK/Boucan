import { drawSprite } from '../../engine/assets';
import { box, circle, ellipse, g, INK, outlineText, slam } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { between, GY, hero, isPress } from '../common';

/**
 * LANCE LE PLUS LOIN ! — tap once to lock the power, once more to lock the
 * angle: the ball must land past the flag, far down the field. The camera
 * follows it into the distance, with a slow-motion finish when it is close.
 */
const X = 230;
const ORIGIN = { x: X + 127, y: GY - 213 };
const GRAVITY = 0.0011;
const FORCE_PERIOD = 700;
const ANGLE_PERIOD = 875;
/** Perspective of the field: vanishing point, near-left and near-right corners of the runway. */
const VP = [1150, 322] as const;
const A0 = [110, 627] as const;
const B0 = [650, 627] as const;
const DEPTH = 190;
const LANDING_Y = GY - 20;
const RELEASE_MS = 110;
const HITSTOP_MS = 220;

const speedOf = (force: number) => 0.45 + 0.75 * force;

/** Horizontal distance travelled by a throw (same integration as the flight). */
function reach(force: number, angle: number): number {
  const v = speedOf(force);
  const r = (angle * Math.PI) / 180;
  const h = LANDING_Y - ORIGIN.y;
  let x = 0;
  let y = 0;
  let vx = v * Math.cos(r);
  let vy = -v * Math.sin(r);
  for (let n = 0; y < h && n < 5000; n++) {
    vy += GRAVITY * 10;
    x += vx * 10;
    y += vy * 10;
  }
  return x;
}

const scale = (d: number) => 1 / (1 + Math.max(0, d) / DEPTH);

/** Ground point at distance d down the field; side −1 / 0 / +1 = left edge / middle / right edge. */
function ground(d: number, side: -1 | 0 | 1): { x: number; y: number; p: number } {
  const p = scale(d);
  const o = side < 0 ? A0 : side > 0 ? B0 : ([(A0[0] + B0[0]) / 2, (A0[1] + B0[1]) / 2] as const);
  return { x: VP[0] + (o[0] - VP[0]) * p, y: VP[1] + (o[1] - VP[1]) * p, p };
}

const meters = (dx: number) => Math.max(0, dx * 1.1);
const label = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2).replace('.', ',')} km` : `${Math.round(m)} m`);

export default defineMicrogame({
  id: 'lancer',
  verb: 'LANCE LE PLUS LOIN !',
  create(ctx) {
    const me = hero(ctx);
    const o1 = between(ctx, 0, Math.PI * 2);
    const o2 = between(ctx, 0, Math.PI * 2);
    const goal = ORIGIN.x + reach(1, 45) * between(ctx, 0.62, 0.68) * (1 + (ctx.level - 1) * 0.12);
    let phase: 'force' | 'angle' | 'wind' | 'fly' | 'land' = 'force';
    let clock = 0;
    let force = 0;
    let angle = 45;
    let windT = 0;
    let hitstop = 0;
    let slowmo = 1;
    let simAcc = 0;
    let zoom = 1;
    let close: boolean | null = null;
    let slows = false;
    let drum = 0;
    let landT = 0;
    let revealed = false;
    let success = false;
    let ball: { x: number; y: number; vx: number; vy: number; rot: number } | null = null;
    let trail: { x: number; y: number; s: number }[] = [];
    const forceAt = (t: number) => 0.5 - 0.5 * Math.cos(o1 + (t / FORCE_PERIOD) * Math.PI * 2);
    const angleAt = (t: number) => 45 + 35 * Math.sin(o2 + (t / ANGLE_PERIOD) * Math.PI * 2);
    const screenOf = (b: { x: number; y: number }) => {
      const c = ground(b.x - ORIGIN.x, 0);
      return { x: c.x, y: c.y - (GY - b.y) * c.p, s: c.p };
    };
    return {
      input(e) {
        if (!isPress(e) || ctx.outcome) return;
        if (phase === 'force') {
          force = forceAt(clock);
          phase = 'angle';
          ctx.sfx('select');
        } else if (phase === 'angle') {
          angle = angleAt(clock);
          phase = 'wind';
          windT = 0;
          me.force('throw');
          ctx.sfx('select');
          // The throw is physics only: its outcome is known right now.
          success = ORIGIN.x + reach(force, angle) >= goal;
        }
      },
      update(dt, t) {
        clock = t;
        me.update(dt);
        if (phase === 'wind' && (windT += dt) >= RELEASE_MS) {
          const v = speedOf(force);
          const r = (angle * Math.PI) / 180;
          ball = { x: ORIGIN.x, y: ORIGIN.y, vx: v * Math.cos(r), vy: -v * Math.sin(r), rot: 0 };
          phase = 'fly';
          hitstop = HITSTOP_MS;
          ctx.shake(220);
          ctx.sfx('hit');
          ctx.sfx('jump');
        }
        if (phase === 'fly' && ball) {
          if (hitstop > 0) hitstop -= dt;
          else {
            if (close === null && ball.vy > 0 && ball.y > GY - 240) {
              const h = LANDING_Y - ball.y;
              const tt = (-ball.vy + Math.sqrt(ball.vy * ball.vy + 2 * GRAVITY * h)) / GRAVITY;
              const landing = ball.x + ball.vx * tt;
              const span = goal - ORIGIN.x;
              close = Math.abs(landing - goal) < 0.3 * span;
              slows = landing - ORIGIN.x > 0.6 * span;
            }
            const near = slows && ball.vy > 0 && ball.y > GY - 240;
            slowmo += ((near ? 0.3 : 2.2) - slowmo) * Math.min(1, dt / (near ? 80 : 200));
            // Fixed 10 ms steps, exactly like reach(): the landing matches the prediction.
            simAcc += dt * slowmo;
            while (simAcc >= 10 && ball.y < LANDING_Y) {
              simAcc -= 10;
              ball.vy += GRAVITY * 10;
              ball.x += ball.vx * 10;
              ball.y += ball.vy * 10;
            }
            ball.rot += dt * slowmo * 0.04;
            trail.push(screenOf(ball));
            if (trail.length > 26) trail.shift();
            if (near && (drum -= dt) <= 0) {
              drum = 95;
              ctx.sfx('tick');
            }
          }
          zoom += (1 + 0.3 * (1 - scale(ball.x - ORIGIN.x)) - zoom) * Math.min(1, dt / 260);
          if (ball.y >= LANDING_Y) {
            ball.y = LANDING_Y;
            // Unless the fuse already decided on the prediction, the landing spot is the truth.
            if (!ctx.outcome) success = ball.x >= goal;
            phase = 'land';
            landT = 0;
            ctx.sfx('pop');
          }
        }
        if (phase === 'land') {
          landT += dt;
          trail.shift();
          if (!revealed && landT > (close ? 750 : 250)) {
            revealed = true;
            if (success) {
              me.force('win');
              ctx.shake(220);
              ctx.win();
            } else {
              me.force('lose');
              ctx.lose();
            }
          }
        }
      },
      timeout: () => (ball && success ? 'success' : 'failure'),
      draw(t) {
        const c = g();
        const flying = phase === 'fly';
        const slow = flying && slowmo < 0.6;
        sceneBg('futur', VP[1] + 2, 0, true);
        c.save();
        c.translate(VP[0], VP[1]);
        c.scale(zoom, zoom);
        c.translate(-VP[0], -VP[1]);
        // Grass, runway, distance lines, flag.
        const hz = VP[1] - 4;
        const grd = c.createLinearGradient(0, hz, 0, 900);
        grd.addColorStop(0, '#7fd6a0');
        grd.addColorStop(1, '#2f9e5d');
        c.fillStyle = grd;
        c.fillRect(-400, hz, 2400, 900);
        c.fillStyle = INK;
        c.fillRect(-400, hz - 3, 2400, 5);
        const far = 1e5;
        const Lf = ground(far, -1);
        const Rf = ground(far, 1);
        const Ln = ground(-600, -1);
        const Rn = ground(-600, 1);
        c.fillStyle = '#e9d9b6';
        c.beginPath();
        c.moveTo(Ln.x, Ln.y);
        c.lineTo(Rn.x, Rn.y);
        c.lineTo(Rf.x, Rf.y);
        c.lineTo(Lf.x, Lf.y);
        c.closePath();
        c.fill();
        c.strokeStyle = INK;
        c.lineWidth = 5;
        for (const side of [-1, 1] as const) {
          const a = ground(-400, side);
          const b = ground(far, side);
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.stroke();
        }
        for (let k = 1; k < 60; k++) {
          const d = (k * 100) / 1.1;
          const a = ground(d, -1);
          const b = ground(d, 1);
          if (a.p < 0.06) break;
          c.strokeStyle = `rgba(255,255,255,${k % 5 ? 0.55 : 0.95})`;
          c.lineWidth = Math.max(1, (k % 5 ? 4 : 8) * a.p);
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.stroke();
          if (k % 5 === 0 && a.p > 0.13) outlineText(`${k * 100} m`, b.x + 30 * a.p + 12, b.y, Math.max(12, Math.round(34 * a.p + 8)), '#fff', 'left', 4);
        }
        {
          const d = goal - ORIGIN.x;
          const a = ground(d, -1);
          const b = ground(d, 1);
          c.strokeStyle = '#ffd23c';
          c.lineWidth = Math.max(3, 14 * a.p);
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.stroke();
          const fh = 420 * a.p + 30;
          const sq = 9 + 20 * a.p;
          c.fillStyle = INK;
          c.fillRect(b.x - 2, b.y - fh, 4, fh);
          for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) {
            c.fillStyle = (k + j) % 2 ? '#fff' : INK;
            c.fillRect(b.x + 2 + k * sq, b.y - fh + j * sq, sq, sq);
          }
          outlineText('OBJECTIF', b.x + 10, b.y - fh - 18, Math.round(22 * (1 + 0.08 * Math.sin(t / 150))), '#ffe04a', 'center', 5);
        }
        me.draw(X, GY);
        const drawBall = (x: number, y: number, r: number, s: number) => {
          if (drawSprite('balle', 'balle', 0, x, y, Math.max(5, 58 * s), false, r)) return;
          circle(x, y, Math.max(3, 26 * s), '#ff8a1f', Math.max(2, 5 * s));
        };
        if (ball) {
          c.lineCap = 'round';
          for (let i = 1; i < trail.length; i++) {
            const a = trail[i - 1]!;
            const b = trail[i]!;
            const k = i / trail.length;
            c.strokeStyle = `hsla(${(t / 3 + i * 14) % 360},95%,65%,${k * 0.9})`;
            c.lineWidth = Math.max(2, 34 * b.s * k);
            c.beginPath();
            c.moveTo(a.x, a.y);
            c.lineTo(b.x, b.y);
            c.stroke();
          }
          const sp = screenOf(ball);
          const gp = ground(ball.x - ORIGIN.x, 0);
          ellipse(gp.x, gp.y, Math.max(3, 30 * gp.p), Math.max(1, 7 * gp.p), 'rgba(0,0,0,.25)', 0);
          if (phase === 'land') {
            const k = Math.min(1, landT / 140);
            const R = (26 + 10 * Math.sin(landT / 60)) * (landT < 140 ? k * 1.6 : 1);
            c.save();
            c.translate(sp.x, sp.y - 10);
            c.rotate(landT / 200);
            c.fillStyle = '#fff8c2';
            c.strokeStyle = INK;
            c.lineWidth = 3;
            c.beginPath();
            for (let i = 0; i < 8; i++) {
              const a = (i * Math.PI) / 4;
              const rr = i % 2 ? R * 0.35 : R;
              c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
            }
            c.closePath();
            c.fill();
            c.stroke();
            c.restore();
            outlineText(label(meters(ball.x - ORIGIN.x)), sp.x, sp.y - 60, 24, '#fff', 'center', 5);
          } else drawBall(sp.x, sp.y, ball.rot, sp.s * (slow ? 1.4 : 1));
        } else {
          const early = phase === 'wind' && windT < RELEASE_MS;
          drawBall(X + (early ? -40 : 110), early ? GY - 275 : GY - 140, 0, 1);
        }
        c.restore();
        // Launch flash and speed lines.
        if (flying && hitstop > 0) {
          const k = hitstop / HITSTOP_MS;
          c.fillStyle = `rgba(255,255,255,${k * 0.8})`;
          c.fillRect(0, 0, 1280, 720);
          slam('BAM !', HITSTOP_MS - hitstop, '#ff4f7b', 520, 250, 120);
        }
        if (flying && hitstop <= 0 && !slow) {
          const k = Math.min(1, slowmo / 2);
          c.strokeStyle = `rgba(255,255,255,${0.5 * k})`;
          c.lineCap = 'round';
          for (let i = 0; i < 26; i++) {
            const a = (i / 26) * Math.PI * 2 + 0.3;
            const r0 = 300 + ((t * 1.4 + i * 97) % 700);
            const L = 90 + 140 * k;
            c.lineWidth = 3 + (i % 3) * 2;
            c.beginPath();
            c.moveTo(VP[0] + Math.cos(a) * r0, VP[1] + Math.sin(a) * r0 * 0.7);
            c.lineTo(VP[0] + Math.cos(a) * (r0 + L), VP[1] + Math.sin(a) * (r0 + L) * 0.7);
            c.stroke();
          }
        }
        if ((slow && close) || (phase === 'land' && !revealed && close)) {
          const vg = c.createRadialGradient(VP[0], VP[1], 160, VP[0], VP[1], 900);
          vg.addColorStop(0, 'rgba(0,0,0,0)');
          vg.addColorStop(1, 'rgba(0,0,0,.65)');
          c.fillStyle = vg;
          c.fillRect(0, 0, 1280, 720);
          outlineText('ÇA PASSE… ?', 640, 250 + Math.sin(t / 90) * 4, 56, '#fff', 'center', 8);
        }
        // Aiming: power bar, then the swinging angle.
        if (phase === 'force' || phase === 'angle' || phase === 'wind') {
          const fx = 70;
          const fy = 150;
          const fh = 300;
          const fv = phase === 'force' ? forceAt(clock) : force;
          box(fx - 26, fy - 6, 52, fh + 12, INK, 0, 14);
          const bar = c.createLinearGradient(0, fy + fh, 0, fy);
          bar.addColorStop(0, '#2fd07a');
          bar.addColorStop(0.6, '#ffc93c');
          bar.addColorStop(1, '#ff4f4f');
          c.fillStyle = bar;
          c.fillRect(fx - 18, fy + fh * (1 - fv), 36, fh * fv);
          outlineText('FORCE', fx, fy - 28, 24, phase === 'force' ? '#ffe04a' : '#fff', 'center', 5);
          if (phase === 'angle') {
            const cx = X + 40;
            const cy = GY - 150;
            const R = 150;
            const a = (angleAt(clock) * Math.PI) / 180;
            c.strokeStyle = 'rgba(22,22,22,.7)';
            c.lineWidth = 10;
            c.beginPath();
            c.arc(cx, cy, R, -Math.PI / 2, 0);
            c.stroke();
            c.strokeStyle = '#7dff9b';
            c.lineWidth = 6;
            c.beginPath();
            c.arc(cx, cy, R, -Math.PI / 4 - 0.26, -Math.PI / 4 + 0.26);
            c.stroke();
            c.strokeStyle = INK;
            c.lineWidth = 9;
            c.beginPath();
            c.moveTo(cx, cy);
            c.lineTo(cx + Math.cos(a) * R, cy - Math.sin(a) * R);
            c.stroke();
            c.strokeStyle = '#ffe04a';
            c.lineWidth = 5;
            c.stroke();
            outlineText(`${Math.round(angleAt(clock))}°`, cx + R * 0.7, cy - R - 10, 26, '#fff', 'center', 5);
          }
        }
        const d = ball ? meters(ball.x - ORIGIN.x) : 0;
        outlineText(label(d), 640, 130, Math.round(64 + (flying && !slow ? 24 : 0)), '#fff', 'center', 8);
        outlineText(`objectif ${label(meters(goal - ORIGIN.x))}`, 640, 186, 26, '#ffe04a', 'center', 5);
        if (revealed) slam(success ? 'SUPER LANCER !' : 'PAS ASSEZ LOIN', landT - (close ? 750 : 250), success ? '#7dff9b' : '#ff6b6b', 640, 320, 80, 1000);
      },
    };
  },
});
