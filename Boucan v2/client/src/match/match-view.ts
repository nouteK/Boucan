import { createRng, microgameInfo, type JsonValue, type MicrogameInfo, type RoomSnapshot, type Round } from '@boucan/shared';
import type { BoucanClient } from '@boucan/sdk';
import { GAME, ZONE_THEMES } from '../config';
import { audio } from '../engine/audio';
import { easeInCubic, easeOutCubic, g, lerp, outlineText, setContext, slam } from '../engine/draw';
import { isTouchMode, type GameInput } from '../engine/input';
import { offscreen, type Screen } from '../engine/screen';
import type { MgContext, MgInstance } from '../microgames/api';
import { microgameDef } from '../microgames';
import { drawResults, drawStageIntro } from './ceremonies';
import { fuseTimer, instruction, outcomeSticker, progressChips } from './hud';
import { counterText, drawLineup, drawPortalFrame, drawStage, PORTAL } from './interlude';
import { roster, type RosterEntry } from './roster';

interface Current {
  round: Round;
  info: MicrogameInfo;
  verb: string;
  instance: MgInstance;
  ctx: MgContext;
  tempo: number;
  duration: number;
  lastT: number;
  outcome: 'success' | 'failure' | null;
  outcomeAt: number;
  reported: boolean;
  participant: boolean;
  lastDigit: number;
}

const ZOOM_IN_MS = 420;
const ZOOM_OUT_MS = 380;

/**
 * Presents a match, WarioWare-style, entirely driven by the server clock:
 * stage intro → interlude (counter, banners, jingle) → zoom into the screen →
 * microgame (instruction, fuse bomb, live chips) → zoom out → reactions →
 * … → final ranking. It never decides anything: it shows the snapshot and
 * reports the local outcome of solo microgames.
 */
export class MatchView {
  private readonly buffer = offscreen();
  private current: Current | null = null;
  private shakeMs = 0;
  private readonly once = new Set<string>();
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly client: BoucanClient,
    private readonly screen: Screen,
  ) {
    this.offs.push(
      client.on('minigameState', (m) => {
        if (this.current?.round.roundId === m.roundId) this.current.instance.onState?.(m.state, m.serverTime);
      }),
      client.on('minigameEvent', (m) => {
        if (this.current?.round.roundId === m.roundId) this.current.instance.onEvent?.(m.event, m.serverTime);
      }),
    );
  }

  dispose(): void {
    this.offs.forEach((off) => off());
    this.release();
  }

  /** Lets the current microgame free its resources before it is dropped. */
  private release(): void {
    const c = this.current;
    this.current = null;
    try {
      c?.instance.dispose?.();
    } catch (error) {
      console.error(`[microgame ${c?.info.id}] dispose failed`, error);
    }
  }

  input(e: GameInput): void {
    const c = this.current;
    const s = this.client.snapshot;
    if (!c || !s || s.match.phase !== 'MICROGAME' || !c.participant) return;
    if (this.client.serverNow() > c.round.timing.endsAt) return;
    c.instance.input?.(e);
  }

  frame(dtReal: number): void {
    const s = this.client.snapshot;
    if (!s) return;
    const now = this.client.serverNow();
    this.shakeMs = Math.max(0, this.shakeMs - dtReal);
    const players = roster(s, this.client.playerId);
    this.syncRound(s, players);
    const phaseT = now - s.match.phaseStartedAt;
    const c = this.screen.begin();
    c.fillStyle = '#000';
    c.fillRect(0, 0, GAME.width, GAME.height);
    switch (s.match.phase) {
      case 'STAGE_INTRO':
        if (this.first(`intro:${s.match.matchId}`)) audio.sfx('fanfare');
        drawStageIntro(s.match.zone, s.lobby.config.zone === 'mix', s.match.level, s.match.levels, players, phaseT);
        break;
      case 'INTERLUDE':
        this.drawInterlude(s, players, now);
        break;
      case 'MICROGAME':
        this.drawMicrogame(s, players, now);
        break;
      case 'VERDICT':
        this.drawVerdict(s, players, now, phaseT);
        break;
      case 'STAGE_RESULTS':
        if (this.first(`results:${s.match.matchId}`)) audio.sfx(s.match.final?.winnerIds.includes(this.client.playerId ?? '') ? 'fanfare' : 'lose');
        if (s.match.final) drawResults(s.match.final, players, this.client.playerId, phaseT);
        break;
      default:
        break;
    }
  }

  // ─── Phases ────────────────────────────────────────────────────────────────

  private drawInterlude(s: RoomSnapshot, players: RosterEntry[], now: number): void {
    const round = s.match.round;
    if (!round) return;
    const zone = round.zone;
    const th = ZONE_THEMES[zone];
    const e = now - round.timing.interludeAt;
    const total = round.timing.activeAt - round.timing.interludeAt;
    if (this.first(`jingle:${round.roundId}`)) audio.jingle(th.jingle, round.tempo);
    drawStage(zone, now);
    drawLineup(players, now, { verdict: null, verdictT: 0 });
    const banner = bannerOf(round);
    const bannerAt = total * 0.3;
    drawPortalFrame(() => {
      const c = g();
      c.fillStyle = '#1d1d2b';
      c.fillRect(PORTAL.x, PORTAL.y, PORTAL.w, PORTAL.h);
      slam(counterText(round.index), e, th.counter, PORTAL.x + PORTAL.w / 2, PORTAL.y + PORTAL.h / 2, 150, PORTAL.w - 40, -0.04);
    });
    if (banner && e > bannerAt) {
      if (this.first(`banner:${round.roundId}`)) audio.sfx(banner.sfx);
      slam(banner.text, e - bannerAt, banner.color, 640, 400, 120, 1200, -0.06);
    }
    // Zoom into the screen: the microgame appears inside and fills the view.
    const zoomStart = round.timing.activeAt - Math.min(ZOOM_IN_MS, total * 0.3);
    if (now >= zoomStart && this.current) {
      const k = easeInCubic(Math.min(1, (now - zoomStart) / Math.max(1, round.timing.activeAt - zoomStart)));
      this.renderMicrogame(0, 0);
      this.composite(k);
      if (this.first(`whoosh:${round.roundId}`)) audio.sfx('whoosh');
    }
  }

  private drawMicrogame(s: RoomSnapshot, players: RosterEntry[], now: number): void {
    const c = this.current;
    const round = s.match.round;
    if (!c || !round) return;
    const t = Math.max(0, (now - round.timing.activeAt) * c.tempo);
    const dt = Math.max(0, t - c.lastT);
    c.lastT = t;
    const over = now >= round.timing.endsAt;
    try {
      c.instance.update(over ? dt * 0.5 : dt, Math.min(t, c.duration + 2000));
    } catch (error) {
      console.error(`[microgame ${c.info.id}] update failed`, error);
    }
    // Undecided when the fuse burns out → the microgame's timeout outcome.
    if (c.info.kind !== 'duel' && c.participant && !c.outcome && now >= round.timing.endsAt - 40) {
      this.decide(c, c.instance.timeout?.() ?? 'failure');
    }
    this.renderMicrogame(t, dt);
    this.composite(1);
    // HUD.
    const remaining = round.timing.endsAt - now;
    const digit = remaining > 0 ? Math.ceil(remaining / Math.min(600, round.timing.durationMs / 5)) : 0;
    if (digit > 0 && digit <= 3 && digit !== c.lastDigit) {
      c.lastDigit = digit;
      audio.sfx('tick');
    }
    if (over && this.first(`boom:${round.roundId}`)) audio.sfx('boom');
    if (c.info.kind !== 'duel') fuseTimer(Math.max(0, remaining), round.timing.durationMs, now, over ? now - round.timing.endsAt : 0);
    instruction(c.verb, c.info.hint, t, GAME.instructionMs);
    progressChips(players, round.progress, round.participants);
    if (c.outcome && c.info.kind !== 'duel') outcomeSticker(c.outcome, now - c.outcomeAt);
    const me = players.find((p) => p.isMe);
    if (me && !me.alive) outlineText('FANTÔME · pour le fun', 20, 700, 22, '#bbb', 'left', 4);
    if (!c.participant) outlineText('SPECTATEUR', 640, 30, 26, '#fff', 'center', 5);
  }

  private drawVerdict(s: RoomSnapshot, players: RosterEntry[], now: number, vt: number): void {
    const round = s.match.round;
    const verdict = s.match.verdict;
    const zone = round?.zone ?? s.match.zone;
    drawStage(zone, now);
    drawLineup(players, now, { verdict, verdictT: vt });
    const mine = verdict?.entries.find((e) => e.playerId === this.client.playerId);
    drawPortalFrame(() => {
      const c = g();
      c.fillStyle = '#1d1d2b';
      c.fillRect(PORTAL.x, PORTAL.y, PORTAL.w, PORTAL.h);
      if (mine) {
        const ok = mine.outcome === 'success';
        slam(ok ? 'BRAVO !' : 'RATÉ !', vt - ZOOM_OUT_MS, ok ? '#7dff9b' : '#ff6b6b', PORTAL.x + PORTAL.w / 2, PORTAL.y + PORTAL.h / 2, 120, PORTAL.w - 40);
      }
    });
    if (mine && this.first(`verdict:${verdict!.roundId}`)) {
      if (mine.eliminated) audio.sfx('lose');
      else if (mine.livesDelta < 0) audio.sfx('hurt');
      else if (mine.livesDelta > 0) audio.sfx('levelup');
    }
    if (mine?.eliminated && vt > 300) slam('ÉLIMINÉ !', vt - 300, '#ff6b6b', 640, 420, 130);
    if (verdict?.kind === 'boss' && mine?.livesDelta === 1 && vt > 300) slam('+1 VIE !', vt - 300, '#7dff9b', 640, 420, 110);
    if (vt < ZOOM_OUT_MS) this.composite(1 - easeOutCubic(vt / ZOOM_OUT_MS));
  }

  // ─── Microgame lifecycle ───────────────────────────────────────────────────

  private syncRound(s: RoomSnapshot, players: RosterEntry[]): void {
    const round = s.match.round;
    if (!round || this.current?.round.roundId === round.roundId) {
      if (round && this.current) this.current.round = round;
      return;
    }
    this.release();
    const info = microgameInfo(round.microgameId);
    const def = microgameDef(round.microgameId);
    if (!info || !def) {
      console.warn(`[match] unknown microgame "${round.microgameId}" — update the client`);
      return;
    }
    const me = players.find((p) => p.isMe) ?? players[0]!;
    const participants = players.filter((p) => round.participants.includes(p.id));
    const tempo = round.kind === 'duel' ? 1 : round.tempo;
    const client = this.client;
    let current: Current;
    const decide = (o: 'success' | 'failure') => this.decide(current, o);
    const ctx: MgContext = {
      info,
      rng: createRng(round.seed),
      seed: round.seed,
      level: round.level,
      tempo,
      duration: round.timing.durationMs * tempo,
      me,
      players: participants,
      get outcome() {
        return current.outcome;
      },
      win: () => decide('success'),
      lose: () => decide('failure'),
      send: (input: JsonValue) => {
        if (current.participant) client.sendInput(input, { roundId: round.roundId });
      },
      sfx: (name) => audio.sfx(name),
      shake: (ms) => (this.shakeMs = Math.max(this.shakeMs, ms)),
      activeAt: round.timing.activeAt,
      serverNow: () => client.serverNow(),
      get touch() {
        return isTouchMode();
      },
    };
    let instance: MgInstance;
    try {
      instance = def.create(ctx);
    } catch (error) {
      console.error(`[microgame ${info.id}] create failed`, error);
      return;
    }
    current = {
      round,
      info,
      verb: def.verb,
      instance,
      ctx,
      tempo,
      duration: ctx.duration,
      lastT: 0,
      outcome: null,
      outcomeAt: 0,
      reported: false,
      participant: round.participants.includes(this.client.playerId ?? ''),
      lastDigit: 0,
    };
    this.current = current;
  }

  private decide(c: Current, outcome: 'success' | 'failure'): void {
    if (c.outcome || !c.participant) return;
    if (this.client.serverNow() > c.round.timing.endsAt + 200) return;
    c.outcome = outcome;
    c.outcomeAt = this.client.serverNow();
    audio.sfx(outcome === 'success' ? 'win' : 'lose');
    if (c.info.kind === 'duel' || c.reported) return;
    c.reported = true;
    void this.client.reportResult({ outcome }, c.round.roundId).catch((e: unknown) => console.warn('[match] report refused', e));
  }

  private renderMicrogame(t: number, dt: number): void {
    const c = this.current;
    if (!c) return;
    const k = this.screen.canvas.width / GAME.width;
    if (this.buffer.canvas.width !== this.screen.canvas.width) this.buffer.resize(k);
    const bctx = this.buffer.ctx;
    bctx.setTransform(k, 0, 0, k, 0, 0);
    setContext(bctx);
    try {
      c.instance.draw(t, dt);
    } catch (error) {
      console.error(`[microgame ${c.info.id}] draw failed`, error);
    }
    this.screen.begin();
  }

  /** Draws the microgame buffer from the portal (k = 0) to full screen (k = 1). */
  private composite(k: number): void {
    if (this.buffer.canvas.width === 0 || this.buffer.canvas.height === 0) return;
    const c = g();
    const x = lerp(PORTAL.x, 0, k);
    const y = lerp(PORTAL.y, 0, k);
    const w = lerp(PORTAL.w, GAME.width, k);
    const h = lerp(PORTAL.h, GAME.height, k);
    const sx = this.shakeMs > 0 && k >= 1 ? (Math.random() - 0.5) * Math.min(20, this.shakeMs / 10) : 0;
    const sy = this.shakeMs > 0 && k >= 1 ? (Math.random() - 0.5) * Math.min(20, this.shakeMs / 10) : 0;
    c.drawImage(this.buffer.canvas, x + sx, y + sy, w, h);
    if (k < 1) {
      c.strokeStyle = '#161616';
      c.lineWidth = 8;
      c.strokeRect(x, y, w, h);
    }
  }

  private first(key: string): boolean {
    if (this.once.has(key)) return false;
    this.once.add(key);
    if (this.once.size > 500) this.once.clear();
    return true;
  }
}

function bannerOf(round: Round): { text: string; color: string; sfx: 'speedup' | 'boss' | 'levelup' | 'duel' } | null {
  if (round.kind === 'boss') return { text: 'BOSS !', color: '#ff4f7b', sfx: 'boss' };
  if (round.levelUp) return { text: `NIVEAU ${round.level} !`, color: '#7dff9b', sfx: 'levelup' };
  if (round.speedUp) return { text: 'PLUS VITE !', color: '#ffe04a', sfx: 'speedup' };
  if (round.kind === 'duel') return { text: 'TOUS ENSEMBLE !', color: '#3fb8ff', sfx: 'duel' };
  return null;
}
