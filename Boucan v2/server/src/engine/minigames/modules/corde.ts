import { z } from 'zod';
import { defineMiniGame, type RoundOutcome } from '../api';
import { Alternation, BotClock, Side, twoTeams } from '../kits/duel';

/**
 * DUEL « Tir à la corde » — two teams drawn at random. Pull by pressing left,
 * right, left, right… (only alternating counts). Each pull is divided by the
 * team size, so a smaller team is not handicapped. The team that drags the
 * flag over its line wins; at the end, the flag's side decides.
 *
 * State : { rope: −1..1 (< 0 = left team winning), teams: { left: id[], right: id[] }, pulls: { [id]: count }, winner: 'left' | 'right' | null }
 * Events: { type: 'won', team }
 */
const Input = z.object({ type: z.literal('pull'), side: Side });
/** Rope travel per pull of a lone player; the flag wins at ±WIN. */
const PULL = 0.045;
const WIN = 0.5;
const SHOW_MS = 900;

export const corde = defineMiniGame<z.infer<typeof Input>>({
  id: 'corde',
  input: { schema: Input, ratePerSecond: 20 },
  acceptsReports: false,
  stateHz: 20,
  start(ctx) {
    const [left, right] = twoTeams(ctx.participants, ctx.rng);
    const teamOf = (id: string) => (left.includes(id) ? -1 : 1);
    const alternation = new Alternation();
    const pulls = new Map(ctx.participants.map((id) => [id, 0]));
    let rope = 0;
    let winner: 'left' | 'right' | null = null;
    let wonAt = 0;
    const bots = ctx.participants
      .filter((id) => ctx.isBot(id))
      .map((id) => {
        const skill = ctx.skillOf(id);
        return { id, clock: new BotClock(ctx.activeAt + ctx.rng.range(0, 250), () => (1000 / (2.6 + 3 * skill)) * ctx.rng.range(0.8, 1.2)) };
      });

    const publish = () => ctx.setState({ rope, teams: { left, right }, pulls: Object.fromEntries(pulls), winner });
    publish();

    const win = (team: 'left' | 'right', now: number) => {
      winner = team;
      wonAt = now;
      for (const id of ctx.participants) ctx.settle(id, (teamOf(id) < 0) === (team === 'left') ? 'success' : 'failure');
      ctx.emit({ type: 'won', team });
    };

    const pull = (id: string, side: Side, now: number) => {
      if (winner || !alternation.accept(id, side)) return;
      const team = teamOf(id);
      rope += (team * PULL) / (team < 0 ? left.length : right.length);
      pulls.set(id, pulls.get(id)! + 1);
      if (Math.abs(rope) >= WIN) win(rope < 0 ? 'left' : 'right', now);
      publish();
    };

    return {
      onInput(playerId, input, { now }) {
        pull(playerId, input.side, now);
      },
      onTick(now) {
        for (const bot of bots) if (bot.clock.due(now)) pull(bot.id, alternation.next(bot.id), now);
      },
      isComplete: (now) => winner !== null && now >= wonAt + SHOW_MS,
      results() {
        const out: Record<string, RoundOutcome> = {};
        const team = winner ?? (rope < 0 ? 'left' : rope > 0 ? 'right' : null);
        for (const id of ctx.participants) {
          out[id] = team === null || (teamOf(id) < 0) === (team === 'left') ? 'success' : 'failure';
          ctx.settle(id, out[id]);
        }
        return out;
      },
    };
  },
});
