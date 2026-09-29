import { checkNickname, GAME_RULES, type MatchConfig, type Player, type RoomSnapshot } from '@boucan/shared';
import type { BoucanClient } from '@boucan/sdk';
import { assets } from '../engine/assets';
import { audio } from '../engine/audio';
import { characterFor } from '../match/roster';
import { audioToggles } from './audio-toggles';
import { confirmButton, h, saveProfile, svg, toast } from './dom';
import { boucanLogo } from './logo';
import { drawPortrait, portrait } from './portraits';
import { errorMessage } from './room-code';

/** Chain-link pictogram of the invite button, drawn in currentColor. */
const LINK_ICON =
  '<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="17" stroke-linecap="round"><path d="M39 63L26 76a18 18 0 0 1-25-25l20-20a18 18 0 0 1 25 0"/><path d="M61 37l13-13a18 18 0 0 1 25 25L79 69a18 18 0 0 1-25 0"/><path d="M34 66l32-32"/></g></svg>';

const NICK_ERRORS: Record<string, string> = {
  empty: 'Choisis un pseudo.',
  tooShort: `Au moins ${GAME_RULES.nickname.minLength} caractères.`,
  tooLong: `${GAME_RULES.nickname.maxLength} caractères maximum.`,
  invalidChars: 'Lettres, chiffres, espaces et . _ - ! seulement.',
  noLetter: 'Il faut au moins une lettre.',
  banned: "Ce pseudo n'est pas autorisé.",
};

/** Worlds offered in the lobby (the city only has two games: it comes with « Mélange »). */
const ZONES: { value: MatchConfig['zone']; label: string }[] = [
  { value: 'mix', label: 'Mélange' },
  { value: 'prairie', label: 'Prairie' },
  { value: 'desert', label: 'Désert' },
  { value: 'tresor', label: 'Trésor' },
  { value: 'futur', label: 'Futur' },
];
const LENGTHS: { value: MatchConfig['length']; label: string }[] = [
  { value: 'court', label: 'Courte' },
  { value: 'normal', label: 'Normale' },
  { value: 'long', label: 'Longue' },
];

/**
 * Lobby: room code, players (humans + bots), your nickname and character,
 * host settings, ready / start. Built once, then updated in place on every
 * snapshot (so typing a nickname is never interrupted).
 */
export class LobbyView {
  private readonly root: HTMLElement;
  private readonly players = h('div', { class: 'players', role: 'list', 'aria-label': 'Joueurs' });
  private readonly settings = h('div', { class: 'settings' });
  private readonly code = h('strong');
  private readonly nick = h('input', { type: 'text', class: 'me__nick', maxlength: 32, 'aria-label': 'Ton pseudo', autocomplete: 'nickname', spellcheck: 'false' });
  private readonly nickErr = h('p', { class: 'me__err', 'aria-live': 'polite' });
  private readonly meCanvas = h('canvas', { 'aria-hidden': 'true' });
  private readonly charName = h('p', { class: 'me__char' });
  private readonly ready = h('button', { type: 'button', class: 'btn btn--blue' });
  private readonly start = h('button', { type: 'button', class: 'btn btn--yellow btn--big' }, 'LANCER !');
  private readonly hint = h('p', { class: 'lobby__hint', 'aria-live': 'polite' });
  private readonly toggles = audioToggles('small');
  private snapshot: RoomSnapshot | null = null;
  private lastCharKey = '';

  constructor(
    parent: HTMLElement,
    private readonly client: BoucanClient,
    private readonly options: { offline: boolean; leave(): void },
  ) {
    const link = h(
      'button',
      { type: 'button', class: 'btn btn--blue btn--icon', onclick: () => this.copyLink() },
      svg(LINK_ICON),
      'LIEN',
    );
    this.nick.addEventListener('change', () => this.commitNickname());
    this.nick.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.nick.blur();
    });
    this.nick.addEventListener('input', () => {
      this.nickErr.textContent = '';
      this.nick.removeAttribute('aria-invalid');
    });
    this.ready.addEventListener('click', () => this.run(() => this.client.setReady(!this.me()?.ready)));
    this.start.addEventListener('click', () => this.run(() => this.client.startMatch()));
    const arrow = (dir: -1 | 1, label: string) =>
      h('button', { type: 'button', class: 'me__arrow', 'aria-label': label, onclick: () => this.cycleCharacter(dir) }, dir < 0 ? '<' : '>');

    this.root = h(
      'div',
      { class: 'screen screen--lobby' },
      h(
        'section',
        { class: 'stage', 'aria-label': 'Salon de la partie' },
        h(
          'div',
          { class: 'lobby' },
          h(
            'header',
            { class: 'lobby__head' },
            boucanLogo('lobby__logo'),
            h('h1', { class: 'lobby__title' }, options.offline ? 'PARTIE SOLO' : 'SALON'),
            options.offline ? null : h('div', { class: 'lobby__code' }, h('small', {}, 'CODE'), this.code, link),
          ),
          h(
            'div',
            { class: 'lobby__panel' },
            h(
              'div',
              { class: 'me' },
              h('span', { class: 'me__tag' }, 'TOI'),
              h('div', { class: 'me__stage' }, arrow(-1, 'Personnage précédent'), this.meCanvas, arrow(1, 'Personnage suivant')),
              this.charName,
              h('label', { for: 'nick' }, 'PSEUDO'),
              this.nick,
              this.nickErr,
              this.ready,
            ),
            this.players,
            this.settings,
          ),
          h(
            'footer',
            { class: 'lobby__foot' },
            confirmButton('QUITTER', 'SÛR ?', () => this.options.leave()),
            this.toggles.el,
            h('div', { class: 'grow' }),
            this.hint,
            this.start,
          ),
        ),
      ),
    );
    this.nick.id = 'nick';
    parent.replaceChildren(this.root);
  }

  dispose(): void {
    this.toggles.dispose();
    this.root.remove();
  }

  update(snapshot: RoomSnapshot): void {
    this.snapshot = snapshot;
    const { lobby } = snapshot;
    const me = this.me();
    const isHost = lobby.hostId === this.client.playerId;
    this.code.textContent = lobby.code;

    if (me) {
      if (document.activeElement !== this.nick) this.nick.value = me.nickname;
      const charId = characterFor(me);
      const key = `${charId}:${me.seat}`;
      if (key !== this.lastCharKey) {
        this.lastCharKey = key;
        drawPortrait(this.meCanvas, charId, me.seat, 'win');
        this.charName.textContent = assets.characterList().find((c) => c.id === charId)?.name ?? 'Élève';
      }
      this.ready.textContent = me.ready ? 'PAS PRÊT' : 'JE SUIS PRÊT';
      this.ready.className = `btn ${me.ready ? '' : 'btn--blue'}`;
      this.ready.setAttribute('aria-pressed', String(me.ready));
    }

    this.players.replaceChildren(...this.slots(lobby.players, isHost));
    this.settings.replaceChildren(
      this.segment('MONDE', ZONES, lobby.config.zone, isHost, (zone) => ({ zone })),
      this.segment(
        'VIES',
        GAME_RULES.livesOptions.map((n) => ({ value: n, label: String(n) })),
        lobby.config.lives,
        isHost,
        (lives) => ({ lives }),
      ),
      this.segment('DURÉE', LENGTHS, lobby.config.length, isHost, (length) => ({ length })),
    );

    this.start.hidden = !isHost;
    this.start.disabled = !lobby.canStart;
    const waiting = lobby.players.filter((p) => !p.isBot && !p.ready && p.connection === 'connected');
    this.hint.textContent = isHost
      ? lobby.canStart
        ? 'Tout le monde est prêt !'
        : `En attente : ${waiting.map((p) => p.nickname).join(', ')}`
      : "L'hôte lance la partie quand tout le monde est prêt.";
  }

  // ─── Parts ─────────────────────────────────────────────────────────────────

  private slots(players: readonly Player[], isHost: boolean): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (let seat = 0; seat < GAME_RULES.maxPlayers; seat++) {
      const p = players.find((x) => x.seat === seat);
      if (!p) {
        out.push(
          h(
            'div',
            { class: 'slot slot--empty', role: 'listitem' },
            isHost
              ? h('button', { type: 'button', class: 'slot__add', onclick: () => this.run(() => this.client.addBot()) }, '+ BOT')
              : 'Place libre',
          ),
        );
        continue;
      }
      const mine = p.id === this.client.playerId;
      const tags = [p.isHost ? 'Hôte' : '', p.isBot ? 'Bot' : '', p.connection !== 'connected' ? 'Déconnecté' : p.ready ? 'Prêt' : 'Pas prêt'].filter(Boolean).join(' · ');
      out.push(
        h(
          'div',
          {
            class: `slot ${mine ? 'slot--me' : ''} ${p.ready ? 'slot--ready' : ''} ${p.connection !== 'connected' ? 'slot--away' : ''}`,
            role: 'listitem',
          },
          portrait(characterFor(p), p.seat),
          h('div', { class: 'slot__name' }, mine ? `${p.nickname} (toi)` : p.nickname),
          h('div', { class: 'slot__tags' }, tags),
          isHost && !mine
            ? h('button', { type: 'button', class: 'slot__kick', 'aria-label': `Exclure ${p.nickname}`, title: 'Exclure', onclick: () => this.run(() => this.client.kick(p.id)) }, '✕')
            : null,
        ),
      );
    }
    return out;
  }

  private segment<T extends string | number>(
    title: string,
    options: readonly { value: T; label: string }[],
    current: T,
    editable: boolean,
    patch: (v: T) => Partial<MatchConfig>,
  ): HTMLElement {
    return h(
      'div',
      {},
      h('p', { class: 'setting__label' }, title),
      h(
        'div',
        { class: `seg ${editable ? '' : 'seg--locked'}`, role: 'group', 'aria-label': title },
        ...options.map((o) =>
          h(
            'button',
            {
              type: 'button',
              'aria-pressed': String(o.value === current),
              disabled: !editable,
              onclick: () => o.value !== current && this.run(() => this.client.configureMatch(patch(o.value))),
            },
            o.label,
          ),
        ),
      ),
    );
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  private me(): Player | undefined {
    return this.snapshot?.lobby.players.find((p) => p.id === this.client.playerId);
  }

  private run(fn: () => Promise<unknown>): void {
    audio.unlock();
    audio.sfx('select');
    fn().catch((e: unknown) => toast(document.body, errorMessage(e)));
  }

  private commitNickname(): void {
    const check = checkNickname(this.nick.value);
    const me = this.me();
    if (!check.ok) {
      this.nickErr.textContent = NICK_ERRORS[check.reason] ?? '';
      this.nick.setAttribute('aria-invalid', 'true');
      return;
    }
    if (me && check.nickname === me.nickname) return;
    saveProfile({ nickname: check.nickname, characterId: me?.characterId ?? null });
    this.client.updatePlayer({ nickname: check.nickname }).catch((e: unknown) => {
      this.nickErr.textContent = errorMessage(e);
      this.nick.setAttribute('aria-invalid', 'true');
    });
  }

  private cycleCharacter(dir: -1 | 1): void {
    const me = this.me();
    const list = assets.characterList().filter((c) => assets.hasCharacter(c.id));
    if (!me || list.length === 0) return;
    const current = characterFor(me);
    const i = Math.max(0, list.findIndex((c) => c.id === current));
    const next = list[(i + dir + list.length) % list.length]!.id;
    saveProfile({ nickname: me.nickname, characterId: next });
    this.run(() => this.client.updatePlayer({ characterId: next }));
  }

  private copyLink(): void {
    const code = this.snapshot?.lobby.code;
    if (!code) return;
    const link = `${location.origin}${location.pathname}?room=${code}`;
    audio.unlock();
    audio.sfx('select');
    navigator.clipboard
      ?.writeText(link)
      .then(() => toast(document.body, 'Lien copié ! Envoie-le à tes potes.'))
      .catch(() => toast(document.body, `Code de la partie : ${code}`));
  }
}
