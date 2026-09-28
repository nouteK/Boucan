import { z } from 'zod';
import { defineMiniGame, reject, type RoundOutcome } from '../api';

/**
 * DUEL « Le roi de la colline » — one player (drawn at random) is the king on
 * the summit; the others climb the slope on their own and only steer left /
 * right. The king moves along the crest and throws bombs that roll down: a
 * climber hit tumbles 5 m down and is stunned for a moment. A climber
 * reaching the summit dethrones the king (every climber wins); if nobody does
 * in time, the king wins.
 *
 * Lateral moves are lag-compensated (applied from the input's time), so what
 * a player steers is where the server has them.
 *
 * State : { king, kx, kdir, ready, bombs: [{ id, x, z, dx }], climbers: { [id]: { x, z, dir, stun } }, result: 'king' | 'climbers' | null }
 *   x ∈ [−W, W] across the slope, z ∈ [0, L] up the slope (metres); dir / dx = lateral speed factors, so clients
 *   extrapolate between states (climbers climb at ROI.climb, ×1.2 when alone; bombs roll at ROI.bombSpeed).
 * Events: { type: 'throw' }, { type: 'hit', playerId }, { type: 'summit', playerId }
 */
const Dir = z.union([z.literal(-1), z.literal(0), z.literal(1)]);
const Input = z.union([z.object({ type: z.literal('move'), dir: Dir }), z.object({ type: z.literal('throw') })]);
export const ROI = {
  /** Length and half width of the slope (m). */
  L: 20,
  W: 3,
  /** Lateral speed, climbing speed, bomb speed down the slope (m/s). */
  move: 4.2,
  climb: 2.3,
  bombSpeed: 11,
  /** Throw cooldown (ms) × factor by number of climbers (index = min(3, climbers)). */
  cooldownMs: 650,
  cooldownFactor: [1, 2.6, 1, 0.6],
  firstThrowMs: 900,
  knock: 5,
  stunMs: 550,
  /** Hit box of a bomb around a climber (m). */
  hitX: 0.75,
  hitZ: 0.6,
  showMs: 1300,
};
const P = ROI;
const clampX = (x: number) => Math.max(-P.W, Math.min(P.W, x));
const r2 = (x: number) => Math.round(x * 100) / 100;

interface Mover {
  x: number;
  dir: number;
  bot: boolean;
  skill: number;
}
interface Climber extends Mover {
  z: number;
  stunUntil: number;
  /** Bot: bomb being dodged, reaction delay, when it was seen, dodge direction. */
  threat: number;
  react: number;
  since: number;
  away: number;
}

export const roi = defineMiniGame<z.infer<typeof Input>>({
  id: 'roi',
  input: { schema: Input, ratePerSecond: 25 },
  acceptsReports: false,
  stateHz: 20,
  start(ctx) {
    const king = ctx.rng.pick(ctx.participants);
    const ids = ctx.rng.shuffle(ctx.participants.filter((id) => id !== king));
    const n = ids.length;
    const climbers = new Map<string, Climber>(
      ids.map((id, i) => [
        id,
        { x: clampX((i - (n - 1) / 2) * 1.6), z: 0, dir: 0, stunUntil: 0, bot: ctx.isBot(id), skill: ctx.skillOf(id), threat: -1, react: 0, since: 0, away: 0 },
      ]),
    );
    const cooldown = P.cooldownMs * (P.cooldownFactor[Math.min(3, n)] ?? 1);
    const ruler: Mover & { readyAt: number; aimError: number } = {
      x: 0,
      dir: 0,
      bot: ctx.isBot(king),
      skill: ctx.skillOf(king),
      readyAt: ctx.activeAt + P.firstThrowMs,
      aimError: 0,
    };
    let bombs: { id: number; x: number; z: number; drift: number }[] = [];
    let nextBomb = 1;
    let result: 'king' | 'climbers' | null = null;
    let resultAt = 0;
    let last = ctx.activeAt;

    const publish = (now: number) =>
      ctx.setState({
        king,
        kx: r2(ruler.x),
        kdir: ruler.dir,
        ready: now >= ruler.readyAt,
        bombs: bombs.map((b) => ({ id: b.id, x: r2(b.x), z: r2(b.z), dx: r2(b.drift) })),
        climbers: Object.fromEntries([...climbers].map(([id, c]) => [id, { x: r2(c.x), z: r2(c.z), dir: c.dir, stun: now < c.stunUntil }])),
        result,
      });
    publish(ctx.activeAt);

    const outcomeOf = (id: string): RoundOutcome => ((id === king) === (result !== 'climbers') ? 'success' : 'failure');
    const finish = (r: 'king' | 'climbers', now: number) => {
      if (result) return;
      result = r;
      resultAt = now;
      for (const id of ctx.participants) ctx.settle(id, outcomeOf(id));
    };

    /** A bomb thrown at `at` (lag-compensated) has already rolled a bit. */
    const throwBomb = (now: number, at: number) => {
      if (result || now < ruler.readyAt) return;
      ruler.readyAt = now + cooldown;
      bombs.push({ id: nextBomb++, x: ruler.x, z: P.L - (P.bombSpeed * (now - at)) / 1000, drift: ctx.rng.range(-0.4, 0.4) });
      ctx.emit({ type: 'throw' });
    };
    /** Changes a lateral direction as if it had happened at `at` (lag compensation). */
    const steer = (m: Mover, dir: number, now: number, at: number, frozen: boolean) => {
      if (!frozen) m.x = clampX(m.x + ((dir - m.dir) * P.move * (now - at)) / 1000);
      m.dir = dir;
    };
    /** Something with a per-frame (60 Hz) probability `p` happens during `dt` ms. */
    const perFrame = (p: number, dt: number) => ctx.rng.chance(1 - (1 - p) ** (dt / 16.7));

    const botKing = (now: number, dt: number) => {
      const all = [...climbers.values()];
      const target = all.filter((c) => now >= c.stunUntil).sort((a, b) => b.z - a.z)[0] ?? all[0];
      if (!target) return;
      if (ruler.aimError === 0 || perFrame(0.01, dt)) ruler.aimError = ctx.rng.range(-1, 1) * (0.2 + 1.1 * (1 - ruler.skill)) || 0.01;
      const tx = target.x + ruler.aimError;
      ruler.dir = Math.abs(tx - ruler.x) > 0.15 ? Math.sign(tx - ruler.x) : 0;
      if (Math.abs(tx - ruler.x) < 0.5 && perFrame(0.05, dt)) throwBomb(now, now);
    };
    const botClimber = (c: Climber, now: number) => {
      if (now < c.stunUntil) {
        c.dir = 0;
        return;
      }
      const reach = 4 + 6 * c.skill;
      const threat = bombs.find((b) => b.z > c.z && b.z - c.z < reach && Math.abs(b.x - c.x) < 1.1);
      if (threat) {
        if (c.threat !== threat.id) {
          c.threat = threat.id;
          c.react = ctx.rng.range(80, 300) * (1.6 - c.skill);
          c.since = now;
          c.away = threat.x > c.x ? -1 : 1;
          if (Math.abs(c.x) > P.W - 0.8) c.away = -Math.sign(c.x);
        }
        c.dir = now - c.since > c.react ? c.away : 0;
      } else c.dir = Math.abs(c.x) > 0.6 ? -Math.sign(c.x) * 0.5 : 0;
    };

    return {
      onInput(playerId, input, { now, at }) {
        if (result) return reject('over');
        if (input.type === 'throw') {
          if (playerId !== king) return reject('notKing');
          throwBomb(now, at);
          return;
        }
        if (playerId === king) steer(ruler, input.dir, now, at, false);
        else {
          const c = climbers.get(playerId);
          if (c) steer(c, input.dir, now, at, now < c.stunUntil);
        }
      },
      onTick(now) {
        const dt = Math.max(0, now - last);
        last = now;
        if (result) {
          publish(now);
          return;
        }
        const s = dt / 1000;
        if (ruler.bot) botKing(now, dt);
        ruler.x = clampX(ruler.x + ruler.dir * P.move * s);
        for (const [id, c] of climbers) {
          if (c.bot) botClimber(c, now);
          if (now < c.stunUntil) continue;
          c.x = clampX(c.x + c.dir * P.move * s);
          c.z = Math.min(P.L, c.z + P.climb * s * (n === 1 ? 1.2 : 1));
          if (c.z >= P.L) {
            ctx.emit({ type: 'summit', playerId: id });
            finish('climbers', now);
            break;
          }
        }
        for (const b of bombs) {
          b.z -= P.bombSpeed * s;
          b.x = clampX(b.x + b.drift * s);
          for (const [id, c] of climbers) {
            if (b.z < -50 || now < c.stunUntil) continue;
            if (Math.abs(b.z - c.z) < P.hitZ && Math.abs(b.x - c.x) < P.hitX) {
              b.z = -99;
              c.z = Math.max(0, c.z - P.knock);
              c.stunUntil = now + P.stunMs;
              ctx.emit({ type: 'hit', playerId: id });
            }
          }
        }
        bombs = bombs.filter((b) => b.z > -3);
        publish(now);
      },
      isComplete: (now) => result !== null && now >= resultAt + P.showMs,
      results(now) {
        finish('king', now);
        return Object.fromEntries(ctx.participants.map((id) => [id, outcomeOf(id)]));
      },
    };
  },
});
