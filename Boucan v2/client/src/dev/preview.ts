import { createRng, microgameInfo, type JsonValue, type MicrogameInfo, type TypedPayload } from '@boucan/shared';
import { GAME } from '../config';
import { assets } from '../engine/assets';
import { audio } from '../engine/audio';
import { outlineText } from '../engine/draw';
import { Input } from '../engine/input';
import { Screen } from '../engine/screen';
import { fuseTimer, instruction, outcomeSticker } from '../match/hud';
import type { MgContext, MgInstance, MgPlayer } from '../microgames/api';
import { microgameDef } from '../microgames';

/**
 * Development only — `?preview=<id>`: plays ONE microgame on its own, in a
 * loop, with no lobby, to tune it and eyeball it. Duels run their real server
 * module in the page, the other players being bots.
 *   &level=1..3   difficulty          &tempo=1.4   speed (solo)
 *   &seed=123     fixed situation     &players=4   participants
 *   &freeze=1500  stop the clock at that time (screenshots)
 * Loaded by main.ts in dev builds only; never shipped.
 */

/** A round of a duel: the server module, driven locally. */
interface DuelRun {
  tick(now: number): void;
  input(value: JsonValue, now: number): void;
  complete(now: number): boolean;
  results(now: number): Record<string, string>;
}

async function duelRun(info: MicrogameInfo, seed: number, players: MgPlayer[], instance: () => MgInstance | null): Promise<DuelRun> {
  const { DUEL_MODULES, silentLogger } = await import('@boucan/server');
  const module = DUEL_MODULES.find((m) => m.id === info.id)!;
  const me = players[0]!.id;
  let clock = 0;
  const runtime = module.start({
    roundId: 'preview',
    info,
    seed,
    level: 1,
    tempo: 1,
    participants: players.map((p) => p.id),
    activeAt: 0,
    endsAt: info.durationMs,
    durationMs: info.durationMs,
    rng: createRng(seed ^ 0x5bd1e995),
    logger: silentLogger,
    isConnected: () => true,
    isBot: (id) => id !== me,
    skillOf: (id) => (id === me ? 0 : 0.72),
    rttOf: () => 0,
    setState: (state) => instance()?.onState?.(JSON.parse(JSON.stringify(state)), clock),
    emit: (event: TypedPayload) => instance()?.onEvent?.(JSON.parse(JSON.stringify(event)), clock),
    settle: () => {},
  });
  return {
    tick(now) {
      clock = now;
      runtime.onTick?.(now);
    },
    input(value, now) {
      const parsed = module.input?.schema.safeParse(value);
      if (parsed?.success) runtime.onInput?.(me, parsed.data, { now, at: now });
      else console.warn('[preview] input refused by the schema', value);
    },
    complete: (now) => runtime.isComplete?.(now) ?? false,
    results: (now) => runtime.results(now),
  };
}

export async function startPreview(root: HTMLElement, q: URLSearchParams): Promise<void> {
  const id = q.get('preview') ?? '';
  const info = microgameInfo(id);
  const def = microgameDef(id);
  document.body.classList.add('in-match');
  const screen = new Screen(root);
  const input = new Input(screen);
  if (!info || !def) {
    const c = screen.begin();
    c.fillStyle = '#161616';
    c.fillRect(0, 0, GAME.width, GAME.height);
    outlineText(`Micro-jeu inconnu : "${id}"`, 640, 360, 40, '#fff');
    return;
  }
  await Promise.all([assets.load(), document.fonts?.load('40px "Luckiest Guy"').catch(() => undefined)]);
  const duel = info.kind === 'duel';
  const level = Math.max(1, Math.min(3, Number(q.get('level')) || 1));
  const tempo = duel ? 1 : Math.max(0.5, Math.min(2, Number(q.get('tempo')) || 1));
  const freeze = q.has('freeze') ? Number(q.get('freeze')) : null;
  const fixedSeed = q.has('seed') ? Number(q.get('seed')) : null;
  const count = Math.max(duel ? 2 : 1, Math.min(8, Number(q.get('players')) || (duel ? 4 : 3)));
  const chars = assets.characterList();
  const names = ['Moi', 'Bip', 'Zoé', 'Tic', 'Momo', 'Lulu', 'Zorg', 'Tac'];
  const players: MgPlayer[] = names.slice(0, count).map((nickname, i) => ({
    id: `p${i}`,
    nickname,
    characterId: chars[i % chars.length]!.id,
    color: GAME.seatColors[i]!,
    isMe: i === 0,
    alive: true,
  }));
  addEventListener('pointerdown', () => audio.unlock(), { capture: true });

  let instance: MgInstance | null = null;
  let run: DuelRun | null = null;
  let outcome: 'success' | 'failure' | null = null;
  let outcomeAt = 0;
  let t = 0;
  let shake = 0;
  let starting = false;
  const round = async () => {
    starting = true;
    instance?.dispose?.();
    instance = null;
    const seed = fixedSeed ?? Math.floor(Math.random() * 1e9);
    outcome = null;
    t = 0;
    const decide = (o: 'success' | 'failure') => {
      if (outcome) return;
      outcome = o;
      outcomeAt = t;
      audio.sfx(o === 'success' ? 'win' : 'lose');
    };
    const ctx: MgContext = {
      info,
      rng: createRng(seed),
      seed,
      level,
      tempo,
      duration: info.durationMs,
      me: players[0]!,
      players,
      get outcome() {
        return outcome;
      },
      win: () => decide('success'),
      lose: () => decide('failure'),
      send: (value) => run?.input(value, t),
      sfx: (name) => audio.sfx(name),
      shake: (ms) => (shake = Math.max(shake, ms)),
      activeAt: 0,
      serverNow: () => t,
    };
    const created = def.create(ctx);
    run = duel ? await duelRun(info, seed, players, () => created) : null;
    instance = created;
    starting = false;
  };
  await round();
  input.on((e) => {
    if (t <= info.durationMs && !outcome) instance?.input?.(e);
  });

  let last = performance.now();
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const real = Math.min(100, now - last);
    last = now;
    if (!instance || starting) return;
    const dt = freeze !== null && t >= freeze ? 0 : real * tempo;
    t += dt;
    shake = Math.max(0, shake - real);
    if (run && dt > 0) {
      run.tick(t);
      if (!outcome && (run.complete(t) || t >= info.durationMs)) {
        const mine = run.results(t)[players[0]!.id];
        outcome = mine === 'success' ? 'success' : 'failure';
        outcomeAt = t;
      }
    }
    instance.update(dt, t);
    if (!run && !outcome && t >= info.durationMs) {
      outcome = instance.timeout?.() ?? 'failure';
      outcomeAt = t;
    }
    const c = screen.begin();
    c.fillStyle = '#000';
    c.fillRect(0, 0, GAME.width, GAME.height);
    c.save();
    if (shake > 0) c.translate((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
    instance.draw(t, dt);
    c.restore();
    if (!duel) {
      const remaining = Math.max(0, (info.durationMs - t) / tempo);
      fuseTimer(remaining, info.durationMs / tempo, now, t > info.durationMs ? (t - info.durationMs) / tempo : 0);
    }
    instruction(def.verb, info.hint, t, GAME.instructionMs);
    if (outcome) outcomeSticker(outcome, t - outcomeAt);
    outlineText(`PREVIEW ${id} · niveau ${level} · ${Math.round(t)} ms`, 20, 700, 18, '#bbb', 'left', 4);
    if (freeze === null && outcome && t > outcomeAt + 1400) void round();
  };
  requestAnimationFrame(frame);
}
