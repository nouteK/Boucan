import { z } from 'zod';
import { defineMiniGame, type RoundOutcome } from '../api';

/**
 * DUEL « Boxe » — everyone is paired for a 1-against-1 fight (an odd player
 * boxes the training bomb). Three hearts each. Tap to punch (each punch
 * tires you a little), hold to guard — but the guard wears out and breaks.
 * K.O. loses; at the bell, the one with fewer hearts loses (a draw spares both).
 *
 * State : { fightAt, fights: [{ a: Boxer, b: Boxer, done, loser: 'a' | 'b' | null }] }
 *   Boxer = { id | null (bomb), hp, guard, punchAt | null, stunned, broken, stamina 0..1 }
 * Events: { type: 'bell' }, { type: 'hit', playerId | null, fight }, { type: 'block', fight }, { type: 'ko', playerId | null, fight }
 */
const Input = z.union([z.object({ type: z.literal('punch') }), z.object({ type: z.literal('guard'), on: z.boolean() })]);
const P = {
  countdownMs: 1500,
  hearts: 3,
  /** Punch: lands at +landMs, over at +endMs. */
  landMs: 130,
  endMs: 300,
  cooldownMs: 450,
  fatiguePerPunch: 130,
  maxFatigue: 520,
  recovery: 0.13,
  stunMs: 380,
  blockedStunMs: 200,
  guardDrain: 0.0006,
  guardRegen: 0.00035,
  guardBreakMs: 900,
  bombSkill: 0.7,
  /** Bots think every 180–320 ms (faster when skilled) and punch less often than they could. */
  aiThinkMs: [180, 320],
  aiPunch: [0.3, 0.25],
  koShowMs: 1200,
};

interface Boxer {
  id: string | null;
  skill: number;
  hp: number;
  cdUntil: number;
  fatigue: number;
  punchAt: number | null;
  landed: boolean;
  stunUntil: number;
  stamina: number;
  brokenUntil: number;
  wantGuard: boolean;
  guard: boolean;
  aiNext: number;
  aiGuardUntil: number;
  opponent: Boxer;
  fight: Fight;
}

interface Fight {
  a: Boxer;
  b: Boxer;
  done: boolean;
  loser: Boxer | null;
}

export const boxe = defineMiniGame<z.infer<typeof Input>>({
  id: 'boxe',
  input: { schema: Input, ratePerSecond: 16 },
  acceptsReports: false,
  stateHz: 20,
  start(ctx) {
    const fightAt = ctx.activeAt + P.countdownMs;
    const order = ctx.rng.shuffle(ctx.participants);
    const boxer = (id: string | null): Boxer =>
      ({
        id,
        skill: id === null ? P.bombSkill : ctx.isBot(id) ? ctx.skillOf(id) : 0,
        hp: P.hearts,
        cdUntil: 0,
        fatigue: 0,
        punchAt: null,
        landed: false,
        stunUntil: 0,
        stamina: 1,
        brokenUntil: 0,
        wantGuard: false,
        guard: false,
        aiNext: fightAt + ctx.rng.range(0, 300),
        aiGuardUntil: 0,
      }) as Boxer;
    const fights: Fight[] = [];
    for (let i = 0; i < order.length; i += 2) {
      const a = boxer(order[i]!);
      const b = boxer(order[i + 1] ?? null);
      a.opponent = b;
      b.opponent = a;
      const fight: Fight = { a, b, done: false, loser: null };
      a.fight = fight;
      b.fight = fight;
      fights.push(fight);
    }
    const boxers = fights.flatMap((f) => [f.a, f.b]);
    const byId = new Map(boxers.filter((b) => b.id !== null).map((b) => [b.id!, b]));
    const isAi = (b: Boxer) => b.id === null || ctx.isBot(b.id);
    let bell = false;
    let over: number | null = null;
    let last = ctx.activeAt;

    const view = (b: Boxer, now: number) => ({
      id: b.id,
      hp: b.hp,
      guard: b.guard,
      punchAt: b.punchAt,
      stunned: now < b.stunUntil,
      broken: now < b.brokenUntil,
      stamina: Math.round(b.stamina * 100) / 100,
    });
    const publish = (now: number) =>
      ctx.setState({
        fightAt,
        fights: fights.map((f) => ({ a: view(f.a, now), b: view(f.b, now), done: f.done, loser: f.loser === null ? null : f.loser === f.a ? 'a' : 'b' })),
      });
    publish(ctx.activeAt);

    const punch = (b: Boxer, now: number) => {
      if (b.fight.done || now < fightAt || now < b.cdUntil || now < b.stunUntil || b.guard || b.punchAt !== null || b.hp <= 0) return;
      b.punchAt = now;
      b.landed = false;
      b.cdUntil = now + P.cooldownMs + b.fatigue;
      b.fatigue = Math.min(P.maxFatigue, b.fatigue + P.fatiguePerPunch);
    };

    const think = (b: Boxer, now: number) => {
      b.wantGuard = now < b.aiGuardUntil;
      if (now < b.aiNext) return;
      b.aiNext = now + ctx.rng.range(P.aiThinkMs[0]!, P.aiThinkMs[1]!) * (1.5 - b.skill);
      const o = b.opponent;
      if (o.punchAt !== null && now - o.punchAt < 90 && ctx.rng.chance(0.3 + 0.55 * b.skill)) {
        b.aiGuardUntil = now + ctx.rng.range(250, 450);
        return;
      }
      if (now >= b.cdUntil && !b.wantGuard && ctx.rng.chance(P.aiPunch[0]! + P.aiPunch[1]! * b.skill)) punch(b, now);
      else if (ctx.rng.chance(0.12)) b.aiGuardUntil = now + ctx.rng.range(200, 400);
    };

    const endFight = (f: Fight, loser: Boxer | null) => {
      f.done = true;
      f.loser = loser;
      for (const b of [f.a, f.b]) if (b.id !== null) ctx.settle(b.id, b === loser ? 'failure' : 'success');
    };

    return {
      onInput(playerId, input, { now }) {
        const b = byId.get(playerId);
        if (!b) return;
        if (input.type === 'guard') b.wantGuard = input.on;
        else punch(b, now);
      },
      onTick(now) {
        const dt = Math.max(0, now - last);
        last = now;
        if (!bell && now >= fightAt) {
          bell = true;
          ctx.emit({ type: 'bell' });
        }
        for (const b of boxers) {
          b.fatigue = Math.max(0, b.fatigue - dt * P.recovery);
          if (b.fight.done || now < fightAt) {
            b.guard = false;
            continue;
          }
          if (isAi(b)) think(b, now);
          const can = b.wantGuard && now >= b.brokenUntil && now >= b.stunUntil && b.punchAt === null;
          if (can) {
            b.stamina -= dt * P.guardDrain;
            if (b.stamina <= 0) {
              b.stamina = 0;
              b.brokenUntil = now + P.guardBreakMs;
            }
          } else b.stamina = Math.min(1, b.stamina + dt * P.guardRegen);
          b.guard = can && b.stamina > 0;
          if (b.punchAt === null) continue;
          const since = now - b.punchAt;
          if (since >= P.landMs && !b.landed) {
            b.landed = true;
            const o = b.opponent;
            const f = fights.indexOf(b.fight);
            if (o.guard) {
              b.stunUntil = now + P.blockedStunMs;
              ctx.emit({ type: 'block', fight: f });
            } else if (o.hp > 0) {
              o.hp -= 1;
              o.stunUntil = now + P.stunMs;
              ctx.emit({ type: 'hit', playerId: o.id, fight: f });
              if (o.hp <= 0) {
                endFight(b.fight, o);
                ctx.emit({ type: 'ko', playerId: o.id, fight: f });
              }
            }
          }
          if (since >= P.endMs) b.punchAt = null;
        }
        if (over === null && fights.every((f) => f.done)) over = now;
        publish(now);
      },
      isComplete: (now) => over !== null && now >= over + P.koShowMs,
      results() {
        for (const f of fights) if (!f.done) endFight(f, f.a.hp < f.b.hp ? f.a : f.b.hp < f.a.hp ? f.b : null);
        const out: Record<string, RoundOutcome> = {};
        for (const f of fights) for (const b of [f.a, f.b]) if (b.id !== null) out[b.id] = b === f.loser ? 'failure' : 'success';
        return out;
      },
    };
  },
});
