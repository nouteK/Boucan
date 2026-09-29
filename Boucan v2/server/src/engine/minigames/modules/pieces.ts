import { z } from 'zod';
import { defineMiniGame, reject, type RoundOutcome } from '../api';

/**
 * DUEL « Qui a le plus ? » — everyone on their own lane; the same rain of
 * coins and bombs falls on every lane. Steer left / right under the coins
 * (+1), away from the bombs (−2 and stunned). When time is up, whoever has
 * the most coins wins (ties win together).
 *
 * Lateral moves are lag-compensated (applied from the input's time). The
 * drops are drawn from the server's secret randomness and published at the
 * start, so clients show them falling; a drop is caught when it lands
 * (`at` … `at` + catch window) right above the player.
 *
 * State : { drops: [{ at, x, bomb }], players: { [id]: { x, dir, coins, stun, got: [drop index] } }, end, winners: [id] | null }
 *   x ∈ [−W, W] across the lane (metres), `at` / `end` = server times.
 * Events: { type: 'coin', playerId, i }, { type: 'bomb', playerId, i }
 */
const Dir = z.union([z.literal(-1), z.literal(0), z.literal(1)]);
const Input = z.object({ type: z.literal('move'), dir: Dir });

export const PIECES = {
  /** Playing time, then the result is shown (ms). */
  playMs: 9000,
  showMs: 1300,
  /** Half width of a lane and lateral speed (m, m/s). */
  W: 3,
  speed: 4.6,
  /** A drop is caught within this distance, during this window after landing. */
  reach: 0.62,
  catchMs: 120,
  /** Falling time shown by clients before a drop lands. */
  fallMs: 1100,
  bombPenalty: 2,
  stunMs: 600,
  bombShare: 0.22,
};
const P = PIECES;
const clampX = (x: number) => Math.max(-P.W, Math.min(P.W, x));
const r2 = (x: number) => Math.round(x * 100) / 100;

interface Player {
  x: number;
  dir: number;
  coins: number;
  stunUntil: number;
  got: Set<number>;
  bot: boolean;
  skill: number;
  /** Bot: next decision. */
  thinkAt: number;
}

export const pieces = defineMiniGame<z.infer<typeof Input>>({
  id: 'pieces',
  input: { schema: Input, ratePerSecond: 25 },
  acceptsReports: false,
  stateHz: 20,
  start(ctx) {
    const drops: { at: number; x: number; bomb: boolean }[] = [];
    for (let t = 700; t < P.playMs - 900; t += ctx.rng.range(260, 520)) {
      drops.push({ at: ctx.activeAt + Math.round(t), x: r2(ctx.rng.range(-2.7, 2.7)), bomb: drops.length > 0 && ctx.rng.chance(P.bombShare) });
    }
    const end = ctx.activeAt + P.playMs;
    const players = new Map<string, Player>(
      ctx.participants.map((id) => [id, { x: 0, dir: 0, coins: 0, stunUntil: 0, got: new Set(), bot: ctx.isBot(id), skill: ctx.skillOf(id), thinkAt: 0 }]),
    );
    let winners: string[] | null = null;
    let last = ctx.activeAt;

    const publish = (now: number) =>
      ctx.setState({
        drops,
        players: Object.fromEntries(
          [...players].map(([id, p]) => [id, { x: r2(p.x), dir: p.dir, coins: p.coins, stun: now < p.stunUntil, got: [...p.got] }]),
        ),
        end,
        winners,
      });
    publish(ctx.activeAt);

    const finish = () => {
      if (winners) return;
      const best = Math.max(...[...players.values()].map((p) => p.coins));
      winners = [...players].filter(([, p]) => p.coins === best).map(([id]) => id);
      for (const id of ctx.participants) ctx.settle(id, winners.includes(id) ? 'success' : 'failure');
    };

    const bot = (p: Player, now: number) => {
      if (now < p.thinkAt) return;
      p.thinkAt = now + ctx.rng.range(60, 160) * (1.6 - p.skill);
      const soon = drops.map((d, i) => ({ d, i })).filter(({ d, i }) => !p.got.has(i) && d.at > now - 100 && d.at < now + 1100);
      const coin = soon.filter(({ d }) => !d.bomb).sort((a, b) => a.d.at - b.d.at)[0];
      const bomb = soon.find(({ d }) => d.bomb && d.at - now < 600 && Math.abs(d.x - p.x) < 0.8);
      let tx = coin ? coin.d.x + ctx.rng.range(-1, 1) * (0.1 + 0.7 * (1 - p.skill)) : p.x;
      if (bomb && ctx.rng.chance(0.4 + 0.5 * p.skill)) tx = p.x + (p.x > bomb.d.x ? 1.4 : -1.4);
      p.dir = Math.abs(tx - p.x) > 0.15 ? Math.sign(tx - p.x) : 0;
    };

    return {
      onInput(playerId, input, { now, at }) {
        const p = players.get(playerId);
        if (!p) return reject('notPlaying');
        if (winners) return reject('over');
        // Applied from the input's (lag-compensated) time.
        if (now >= p.stunUntil) p.x = clampX(p.x + ((input.dir - p.dir) * P.speed * (now - at)) / 1000);
        p.dir = input.dir;
      },
      onTick(now) {
        const dt = Math.max(0, now - last);
        last = now;
        if (winners) return;
        for (const [id, p] of players) {
          if (p.bot) bot(p, now);
          if (now >= p.stunUntil) p.x = clampX(p.x + (p.dir * P.speed * dt) / 1000);
          drops.forEach((d, i) => {
            if (p.got.has(i) || now < d.at || now >= d.at + P.catchMs || now < p.stunUntil || Math.abs(d.x - p.x) >= P.reach) return;
            p.got.add(i);
            if (d.bomb) {
              p.coins = Math.max(0, p.coins - P.bombPenalty);
              p.stunUntil = now + P.stunMs;
              ctx.emit({ type: 'bomb', playerId: id, i });
            } else {
              p.coins += 1;
              ctx.emit({ type: 'coin', playerId: id, i });
            }
          });
        }
        if (now >= end) finish();
        publish(now);
      },
      isComplete: (now) => winners !== null && now >= end + P.showMs,
      results() {
        finish();
        return Object.fromEntries(ctx.participants.map((id): [string, RoundOutcome] => [id, winners!.includes(id) ? 'success' : 'failure']));
      },
    };
  },
});
