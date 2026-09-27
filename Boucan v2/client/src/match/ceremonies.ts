import type { FinalRanking, ZoneId } from '@boucan/shared';
import { ZONE_THEMES } from '../config';
import { drawCharacter } from '../engine/assets';
import { box, burst, g, outlineText, radial, slam } from '../engine/draw';
import type { RosterEntry } from './roster';

/** Stage title card: the zone slams in, players run onto the stage. */
export function drawStageIntro(zone: ZoneId, level: number, levels: number, players: readonly RosterEntry[], t: number): void {
  const th = ZONE_THEMES[zone];
  radial(th.bg, t, 18);
  const c = g();
  c.fillStyle = th.accent;
  c.fillRect(0, 520, 1280, 200);
  c.fillStyle = '#161616';
  c.fillRect(0, 516, 1280, 8);
  slam(th.name, t, '#fff', 640, 190, 140);
  if (t > 450) slam(`NIVEAU ${level} / ${levels}`, t - 450, th.counter, 640, 330, 64, 900, 0.03);
  const n = players.length;
  const spacing = Math.min(160, 1180 / Math.max(1, n));
  players.forEach((p, i) => {
    const target = 640 + (i - (n - 1) / 2) * spacing;
    const k = Math.min(1, Math.max(0, (t - 200 - i * 90) / 700));
    const x = -120 + (target + 120) * (1 - (1 - k) ** 3);
    drawCharacter(p.characterId, k < 1 ? 'run' : 'idle', t + i * 50, x, 640, n <= 4 ? 200 : 160, { color: p.color });
    outlineText(p.isMe ? 'TOI' : p.nickname, x, 460 + (i % 2) * 18, 20, p.color, 'center', 4);
  });
}

/** Final ranking: podium for the top 3, the rest listed. */
export function drawResults(final: FinalRanking, players: readonly RosterEntry[], meId: string | null, t: number): void {
  const byId = new Map(players.map((p) => [p.id, p]));
  const iWon = meId !== null && final.winnerIds.includes(meId);
  radial(iWon ? '#ffc93c' : '#5b6cff', t, 20);
  const winners = final.winnerIds.map((id) => byId.get(id)?.nickname ?? '?');
  slam(winners.length === 1 ? `${winners[0]} GAGNE !` : 'ÉGALITÉ !', t, '#fff', 640, 80, 90, 1200);
  const podium = [
    { rank: 2, x: 400, h: 150 },
    { rank: 1, x: 640, h: 220 },
    { rank: 3, x: 880, h: 100 },
  ];
  const base = 640;
  for (const slot of podium) {
    const entries = final.entries.filter((e) => e.rank === slot.rank);
    box(slot.x - 110, base - slot.h, 220, slot.h, ['#ffe04a', '#dfe6ee', '#e8a868'][slot.rank - 1]!, 8, 10);
    outlineText(String(slot.rank), slot.x, base - slot.h / 2, 80, '#fff');
    entries.slice(0, 3).forEach((e, i) => {
      const p = byId.get(e.playerId);
      if (!p) return;
      const x = slot.x + (i - (Math.min(3, entries.length) - 1) / 2) * 70;
      if (slot.rank === 1 && t % 1400 < 700) burst(x, base - slot.h - 120, 90 + Math.sin(t / 90) * 8, '#ffe04a', '#fff', t / 800);
      drawCharacter(p.characterId, slot.rank === 1 ? 'win' : 'idle', t + i * 70, x, base - slot.h, entries.length > 1 ? 160 : 210, { color: p.color });
      outlineText(p.isMe ? 'TOI' : p.nickname, x, base - slot.h - (entries.length > 1 ? 180 : 230), 24, p.color, 'center', 5);
    });
  }
  // Others (4th and more).
  const rest = final.entries.filter((e) => e.rank > 3);
  rest.forEach((e, i) => {
    const p = byId.get(e.playerId);
    if (!p) return;
    outlineText(`${e.rank}. ${p.isMe ? 'TOI' : p.nickname}`, 110 + (i % 2) * 0, 170 + i * 44, 26, p.color, 'left', 5);
  });
  // Stats line.
  const me = final.entries.find((e) => e.playerId === meId);
  if (me) {
    const text = me.alive ? `Survivant · ${me.lives} vie${me.lives > 1 ? 's' : ''} · ${me.wins} micro-jeux gagnés` : `Éliminé au n°${me.eliminatedAt} · ${me.wins} micro-jeux gagnés`;
    outlineText(text, 640, 680, 30, '#fff');
  }
  outlineText(`${final.microgamesPlayed} micro-jeux joués`, 1180, 170, 22, '#fff', 'right', 4);
}
