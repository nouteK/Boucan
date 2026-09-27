import { z } from 'zod';
import { defineMiniGame, reject, type RoundOutcome } from '../api';

/**
 * DUEL « Cache-cache dans le noir » — one hunter (drawn at random) with a
 * torch, everyone else in the dark. Move left / right; preys can hide in a
 * bush for a moment (then must come out and wait before hiding again). The
 * hunter grabs whoever is right in front of them and not hidden.
 * Caught preys lose; the hunter wins by catching at least half of them.
 * Movement is simulated on the server from the players' held directions.
 *
 * State : { hunter, world, spots, players: { [id]: { x, face, hidden, out, moving, grabbing } }, result: 'hunter' | 'time' | null }
 * Events: { type: 'grab', playerId }, { type: 'caught', playerId }
 */
const Move = z.union([z.literal(-1), z.literal(0), z.literal(1)]);
const Input = z.union([
  z.object({ type: z.literal('move'), dir: Move }),
  z.object({ type: z.literal('hide'), on: z.boolean() }),
  z.object({ type: z.literal('grab') }),
]);
const P = {
  world: 2400,
  spots: [330, 760, 1180, 1560, 1980],
  hunterSpeed: 0.52,
  preySpeed: 0.36,
  hideMaxMs: 1600,
  hideCooldownMs: 1600,
  spotRadius: 75,
  torch: 230,
  hearing: 320,
  reach: 125,
  /** Right next to the hunter, the side does not matter. */
  close: 45,
  grabLandMs: 120,
  grabEndMs: 300,
  grabCooldownMs: 480,
  showMs: 1300,
};
const STARTS = [250, 700, 1500, 1950, 2200];

interface Runner {
  x: number;
  face: -1 | 1;
  dir: -1 | 0 | 1;
  wantHide: boolean;
  hidden: boolean;
  hideMs: number;
  hideReadyAt: number;
  out: boolean;
  grabAt: number | null;
  grabbed: boolean;
  grabReadyAt: number;
  think: number;
}

export const noir = defineMiniGame<z.infer<typeof Input>>({
  id: 'noir',
  input: { schema: Input, ratePerSecond: 30 },
  acceptsReports: false,
  stateHz: 20,
  start(ctx) {
    const hunter = ctx.rng.pick(ctx.participants);
    const preys = ctx.participants.filter((id) => id !== hunter);
    const players = new Map<string, Runner>();
    let k = 0;
    for (const id of ctx.participants) {
      let x = id === hunter ? 1200 : STARTS[k++ % STARTS.length]!;
      if (id !== hunter && Math.abs(x - 1200) < 350) x += 500;
      players.set(id, { x, face: x < 1200 ? -1 : 1, dir: 0, wantHide: false, hidden: false, hideMs: 0, hideReadyAt: 0, out: false, grabAt: null, grabbed: false, grabReadyAt: 0, think: ctx.activeAt });
    }
    const H = players.get(hunter)!;
    let result: 'hunter' | 'time' | null = null;
    let resultAt = 0;
    let last = ctx.activeAt;

    const publish = () =>
      ctx.setState({
        hunter,
        world: P.world,
        spots: P.spots,
        players: Object.fromEntries(
          [...players].map(([id, p]) => [
            id,
            { x: Math.round(p.x), face: p.face, hidden: p.hidden, out: p.out, moving: p.dir !== 0 && !p.hidden && p.grabAt === null, grabbing: p.grabAt !== null },
          ]),
        ),
        result,
      });
    publish();

    const caughtCount = () => preys.filter((id) => players.get(id)!.out).length;
    const outcomeOf = (id: string): RoundOutcome =>
      id === hunter ? (caughtCount() * 2 >= preys.length ? 'success' : 'failure') : players.get(id)!.out ? 'failure' : 'success';

    const grab = (now: number) => {
      if (result || now < H.grabReadyAt || H.grabAt !== null) return;
      H.grabAt = now;
      H.grabbed = false;
      H.grabReadyAt = now + P.grabCooldownMs;
      ctx.emit({ type: 'grab', playerId: hunter });
    };

    const think = (id: string, p: Runner, now: number) => {
      if (now < p.think) return;
      const skill = ctx.skillOf(id);
      p.think = now + ctx.rng.range(120, 260) * (1.5 - skill);
      if (id === hunter) {
        const seen = preys
          .map((pid) => players.get(pid)!)
          .filter((q) => !q.out && !q.hidden && (Math.abs(q.x - p.x) < P.torch || (q.dir !== 0 && Math.abs(q.x - p.x) < P.hearing)))
          .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
        const target = seen[0];
        if (target) {
          p.dir = target.x > p.x ? 1 : -1;
          if (Math.abs(target.x - p.x) < 115) {
            p.face = p.dir as -1 | 1;
            if (ctx.rng.chance(0.5 + 0.45 * skill)) grab(now);
          }
        } else if (p.dir === 0 || ctx.rng.chance(0.08) || p.x < 120 || p.x > P.world - 120) {
          p.dir = p.x < 120 ? 1 : p.x > P.world - 120 ? -1 : ctx.rng.chance(0.5) ? -1 : 1;
        }
        return;
      }
      const d = H.x - p.x;
      const spot = P.spots.reduce((m, s) => (Math.abs(s - p.x) < Math.abs(m - p.x) ? s : m), P.spots[0]!);
      if (Math.abs(d) < 420 && ctx.rng.chance(0.55 + 0.4 * skill)) {
        const toSpot = spot - p.x;
        if ((Math.abs(toSpot) < 200 && Math.sign(toSpot) !== Math.sign(d)) || Math.abs(toSpot) < 40) {
          p.dir = Math.abs(toSpot) < 25 ? 0 : toSpot > 0 ? 1 : -1;
          p.wantHide = Math.abs(toSpot) < 60;
        } else {
          p.dir = d > 0 ? -1 : 1;
          p.wantHide = false;
        }
      } else if (Math.abs(d) > 600) {
        p.wantHide = false;
        p.dir = ctx.rng.chance(0.3) ? (ctx.rng.chance(0.5) ? -1 : 1) : 0;
      }
    };

    return {
      onInput(playerId, input, { now }) {
        const p = players.get(playerId)!;
        if (input.type === 'grab') {
          if (playerId !== hunter) return reject('notHunter');
          grab(now);
        } else if (input.type === 'move') p.dir = input.dir;
        else if (playerId === hunter) return reject('hunter');
        else p.wantHide = input.on;
      },
      onTick(now) {
        const dt = Math.max(0, now - last);
        last = now;
        if (result) {
          publish();
          return;
        }
        for (const [id, p] of players) {
          if (p.out) continue;
          if (ctx.isBot(id)) think(id, p, now);
          const spot = P.spots.find((s) => Math.abs(s - p.x) < P.spotRadius);
          if (id !== hunter && p.wantHide && spot !== undefined && now >= p.hideReadyAt) {
            p.hidden = true;
            p.hideMs += dt;
            p.x += (spot - p.x) * Math.min(1, dt / 80);
            if (p.hideMs > P.hideMaxMs) {
              p.hidden = false;
              p.hideReadyAt = now + P.hideCooldownMs;
              p.hideMs = 0;
            }
          } else {
            p.hidden = false;
            p.hideMs = Math.max(0, p.hideMs - dt * 0.4);
          }
          const dir = p.hidden || p.grabAt !== null ? 0 : p.dir;
          const speed = id === hunter ? P.hunterSpeed : P.preySpeed;
          p.x = Math.max(60, Math.min(P.world - 60, p.x + dir * speed * dt));
          if (dir) p.face = dir;
        }
        if (H.grabAt !== null) {
          const since = now - H.grabAt;
          if (since >= P.grabLandMs && !H.grabbed) {
            H.grabbed = true;
            for (const id of preys) {
              const q = players.get(id)!;
              const d = q.x - H.x;
              if (q.out || q.hidden || Math.abs(d) >= P.reach || (Math.sign(d) !== H.face && Math.abs(d) >= P.close)) continue;
              q.out = true;
              q.dir = 0;
              ctx.settle(id, 'failure');
              ctx.emit({ type: 'caught', playerId: id });
            }
            if (preys.every((id) => players.get(id)!.out)) {
              result = 'hunter';
              resultAt = now;
              ctx.settle(hunter, 'success');
            }
          }
          if (since >= P.grabEndMs) H.grabAt = null;
        }
        publish();
      },
      isComplete: (now) => result !== null && now >= resultAt + P.showMs,
      results() {
        result ??= 'time';
        const out = Object.fromEntries(ctx.participants.map((id) => [id, outcomeOf(id)]));
        for (const id of ctx.participants) ctx.settle(id, out[id]!);
        return out;
      },
    };
  },
});
