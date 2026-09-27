import { z } from 'zod';
import { defineMiniGame, reject, type RoundOutcome } from '../api';

/**
 * DUEL « Tirs au but » — one keeper (drawn at random) against up to three
 * shooters, one shot each (the others watch from the stands and are safe).
 * The shooter picks left / centre / right and taps when the power bar is on
 * the yellow mark (too weak = slow ball, too strong = over the bar). The
 * keeper dives left / centre / right: a dive in the right direction, early
 * enough, saves it. A goal saves the shooter; the keeper needs to stop at
 * least half of the shots. The ball is slower against a human keeper.
 *
 * State : { keeper, shooters, k, phase: 'aim' | 'fly' | 'result' | 'end', phaseAt, aim, shot, dive, outcomes: { [id]: 'goal' | 'saved' | 'miss' } }
 *   shot = { dir, power, tier, over, at, arrive } ; dive = { dir, at, early }
 * Events: { type: 'shot', shooter, tier, dir }, { type: 'dive', dir }, { type: 'goal' | 'saved' | 'miss', shooter }
 */
const Dir = z.enum(['L', 'C', 'R']);
type Dir = z.infer<typeof Dir>;
const Input = z.union([
  z.object({ type: z.literal('aim'), dir: Dir }),
  z.object({ type: z.literal('shoot') }),
  z.object({ type: z.literal('dive'), dir: Dir }),
]);
const DIRS: readonly Dir[] = ['L', 'C', 'R'];
const P = {
  introMs: 900,
  barMs: 900,
  aimMs: 2200,
  perfect: 0.84,
  /** A save needs the dive to have started this long before the ball arrives. */
  diveMs: 190,
  resultMs: 1000,
  maxShooters: 3,
  humanKeeperSlowdown: 1.8,
  endMs: 900,
};

type Tier = 'weak' | 'normal' | 'strong' | 'perfect' | 'over';
export function shotTier(power: number): Tier {
  if (power > 0.94) return 'over';
  if (power < 0.45) return 'weak';
  const d = Math.abs(power - P.perfect);
  return d < 0.025 ? 'perfect' : d < 0.1 ? 'strong' : 'normal';
}

/** Power bar value (0..1) at time t of an aim phase started at `from`. */
const barAt = (from: number, t: number) => 0.5 - 0.5 * Math.cos((Math.max(0, t - from) / P.barMs) * Math.PI * 2);

export const gardien = defineMiniGame<z.infer<typeof Input>>({
  id: 'gardien',
  input: { schema: Input, ratePerSecond: 12 },
  acceptsReports: false,
  stateHz: 20,
  start(ctx) {
    const keeper = ctx.rng.pick(ctx.participants);
    const shooters = ctx.rng.shuffle(ctx.participants.filter((id) => id !== keeper)).slice(0, P.maxShooters);
    const outcomes = new Map<string, 'goal' | 'saved' | 'miss'>();
    let k = 0;
    let phase: 'aim' | 'fly' | 'result' | 'end' = 'aim';
    let phaseAt = ctx.activeAt + P.introMs;
    let aim: Dir = 'C';
    let shot: { dir: Dir; power: number; tier: Tier; over: boolean; at: number; arrive: number } | null = null;
    let dive: { dir: Dir; at: number; early: boolean } | null = null;
    let botShot: { at: number; dir: Dir } | null = null;
    let botDive: { at: number; dir: Dir } | null = null;
    const current = () => shooters[k]!;

    const publish = () =>
      ctx.setState({ keeper, shooters, k, phase, phaseAt, aim, shot, dive, outcomes: Object.fromEntries(outcomes) });

    const planBots = () => {
      botShot = null;
      botDive = null;
      const shooter = current();
      if (ctx.isBot(shooter)) {
        const skill = ctx.skillOf(shooter);
        const target = Math.min(0.99, Math.max(0.3, P.perfect + ctx.rng.range(-1, 1) * (0.04 + 0.24 * (1 - skill))));
        const theta = Math.acos(1 - 2 * target) / (Math.PI * 2);
        const earliest = phaseAt + ctx.rng.range(400, 1300);
        let at = Infinity;
        for (let n = 0; n < 4 && at === Infinity; n++) {
          for (const f of [theta + n, 1 - theta + n]) {
            const t = phaseAt + f * P.barMs;
            if (t >= earliest && t < at) at = t;
          }
        }
        aim = ctx.rng.pick(DIRS);
        botShot = { at: Math.min(at, phaseAt + P.aimMs - 50), dir: aim };
      }
      if (ctx.isBot(keeper) && ctx.rng.chance(0.25)) botDive = { at: phaseAt + ctx.rng.range(300, 1500), dir: ctx.rng.pick(DIRS) };
    };
    planBots();
    publish();

    const shoot = (at: number, now: number) => {
      if (phase !== 'aim' || now < phaseAt) return;
      const power = barAt(phaseAt, at);
      const tier = shotTier(power);
      const d = Math.abs(power - P.perfect);
      const base = tier === 'weak' ? 850 : tier === 'over' ? 520 : 330 + 300 * Math.min(1, d / 0.39);
      const dur = base * (ctx.isBot(keeper) ? 1 : P.humanKeeperSlowdown);
      shot = { dir: aim, power, tier, over: tier === 'over', at: now, arrive: now + dur };
      phase = 'fly';
      phaseAt = now;
      ctx.emit({ type: 'shot', shooter: current(), tier, dir: aim });
      if (ctx.isBot(keeper) && !dive) {
        const skill = ctx.skillOf(keeper);
        const right = ctx.rng.chance(0.5 + 0.4 * skill);
        botDive = { at: now + ctx.rng.range(90, 280) * (1.6 - skill), dir: right ? aim : ctx.rng.pick(DIRS.filter((x) => x !== aim)) };
      }
      publish();
    };

    const doDive = (dir: Dir, now: number) => {
      if (dive || (phase !== 'aim' && phase !== 'fly') || (phase === 'aim' && now < phaseAt)) return;
      dive = { dir, at: now, early: phase === 'aim' };
      ctx.emit({ type: 'dive', dir });
      // A shooting bot that sees an early dive aims elsewhere (if it is sharp enough).
      const shooter = current();
      if (phase === 'aim' && botShot && botShot.dir === dir && ctx.rng.chance(ctx.skillOf(shooter))) {
        aim = ctx.rng.pick(DIRS.filter((x) => x !== dir));
        botShot.dir = aim;
      }
      publish();
    };

    const next = (now: number) => {
      k += 1;
      shot = null;
      dive = null;
      aim = 'C';
      if (k >= shooters.length) {
        phase = 'end';
        phaseAt = now;
        for (const id of ctx.participants) ctx.settle(id, outcomeOf(id));
      } else {
        phase = 'aim';
        phaseAt = now;
        planBots();
      }
      publish();
    };

    const outcomeOf = (id: string): RoundOutcome => {
      // Only taken shots count (a shooter whose turn never came is safe, like the stands).
      if (id === keeper) {
        const stopped = [...outcomes.values()].filter((o) => o !== 'goal').length;
        return stopped * 2 >= outcomes.size ? 'success' : 'failure';
      }
      const o = outcomes.get(id);
      return o === undefined || o === 'goal' ? 'success' : 'failure';
    };

    return {
      onInput(playerId, input, { now, at }) {
        if (input.type === 'dive') {
          if (playerId !== keeper) return reject('notKeeper');
          doDive(input.dir, now);
          return;
        }
        if (phase !== 'aim' || playerId !== current()) return reject('notYourTurn');
        if (input.type === 'aim') {
          aim = input.dir;
          publish();
        } else shoot(at, now);
      },
      onTick(now) {
        if (phase === 'aim' && now >= phaseAt) {
          if (botShot && now >= botShot.at) {
            aim = botShot.dir;
            shoot(botShot.at, now);
          } else if (now >= phaseAt + P.aimMs) shoot(now, now);
        }
        if (botDive && !dive && now >= botDive.at) doDive(botDive.dir, now);
        if (phase === 'fly' && shot && now >= shot.arrive) {
          const saved = !shot.over && dive !== null && dive.dir === shot.dir && dive.at <= shot.arrive - P.diveMs;
          const outcome = shot.over ? 'miss' : saved ? 'saved' : 'goal';
          outcomes.set(current(), outcome);
          ctx.settle(current(), outcome === 'goal' ? 'success' : 'failure');
          ctx.emit({ type: outcome, shooter: current() });
          phase = 'result';
          phaseAt = now;
          publish();
        }
        if (phase === 'result' && now >= phaseAt + P.resultMs) next(now);
      },
      isComplete: (now) => phase === 'end' && now >= phaseAt + P.endMs,
      results() {
        return Object.fromEntries(ctx.participants.map((id) => [id, outcomeOf(id)]));
      },
    };
  },
});
