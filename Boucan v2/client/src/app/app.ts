import { checkNickname, microgameInfo } from '@boucan/shared';
import { BoucanClient, type RoomSnapshot, type SessionEndReason } from '@boucan/sdk';
import { assets } from '../engine/assets';
import { audio } from '../engine/audio';
import { Input } from '../engine/input';
import { Screen } from '../engine/screen';
import { MatchView } from '../match/match-view';
import { audioToggles } from './audio-toggles';
import { confirmButton, h, loadProfile, saveProfile, toast } from './dom';
import { LobbyView } from './lobby';
import { renderMenu } from './menu';

type View = 'menu' | 'lobby' | 'match';

const SESSION_KEY = 'boucan.session';
const sessionStore = {
  get: () => {
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) sessionStorage.setItem(SESSION_KEY, t);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // storage unavailable
    }
  },
};

/** Fun default nicknames: nobody has to type anything to start playing. */
const DEFAULT_NICKNAMES = ['Biscotte', 'Grelot', 'Pépin', 'Zigzag', 'Moustache', 'Radis', 'Turbo', 'Tambour', 'Cactus', 'Pixel', 'Crumble', 'Gribouille'];

/**
 * The application: screens (menu → lobby → match), the connection (game
 * server, or the in-page engine with ?offline) and the render loop.
 */
export class App {
  private readonly screen: Screen;
  private readonly ui: HTMLElement;
  private readonly hud: HTMLElement;
  private view: View = 'menu';
  client: BoucanClient | null = null;
  private disposeLocal: (() => void) | null = null;
  private match: MatchView | null = null;
  private lobby: LobbyView | null = null;
  private disposeView: (() => void) | null = null;
  private hudToggles: ReturnType<typeof audioToggles> | null = null;
  private lastHudKey = '';
  private offline = new URLSearchParams(location.search).has('offline');
  private readonly assetsReady: Promise<void>;

  constructor(root: HTMLElement) {
    this.screen = new Screen(root);
    this.ui = h('div', { class: 'ui' });
    this.hud = h('div', { class: 'hud', hidden: true });
    root.append(this.ui, this.hud, h('div', { class: 'rotate' }, h('div', { class: 'phone' }), 'Tourne ton téléphone !'));
    // Browsers only allow sound after a user gesture: unlock on the first one.
    const unlock = () => audio.unlock();
    addEventListener('pointerdown', unlock, { capture: true });
    addEventListener('keydown', unlock, { capture: true });
    const input = new Input(this.screen);
    input.on((e) => {
      if (this.view === 'match') this.match?.input(e);
    });
    this.assetsReady = Promise.all([
      assets.load(),
      document.fonts?.load('40px "Luckiest Guy"').catch(() => undefined),
    ]).then(() => undefined);
    let last = performance.now();
    let lastError = '';
    const loop = (now: number) => {
      // Scheduled first: one faulty frame must never freeze the game.
      requestAnimationFrame(loop);
      const dt = Math.min(100, now - last);
      last = now;
      try {
        if (this.view === 'match') this.match?.frame(dt);
      } catch (error) {
        const text = String(error);
        if (text !== lastError) console.error('[match] frame failed', error);
        lastError = text;
      }
    };
    requestAnimationFrame(loop);
  }

  async start(): Promise<void> {
    // Coming back after a reload: resume the seat if the server still has it.
    if (sessionStore.get() && !this.offline) {
      try {
        await this.assetsReady;
        await this.connect();
        await this.client!.resume();
        return;
      } catch {
        sessionStore.set(null);
        this.teardown();
      }
    }
    this.showMenu();
  }

  // ─── Screens ───────────────────────────────────────────────────────────────

  private showMenu(message?: string): void {
    this.setView('menu');
    audio.playMusic('menu');
    this.disposeView = renderMenu(
      this.ui,
      {
        create: async () => {
          await this.assetsReady;
          const player = this.newPlayer();
          if (this.offline) {
            await this.startOffline(player);
            return;
          }
          await this.connect();
          await this.client!.createRoom(player);
        },
        join: async (code) => {
          await this.assetsReady;
          await this.connect();
          await this.client!.joinRoom({ code, ...this.newPlayer() });
        },
      },
      message,
    );
  }

  private onSnapshot(s: RoomSnapshot): void {
    if (s.match.phase === 'LOBBY') {
      if (this.view !== 'lobby' || !this.lobby) {
        this.setView('lobby');
        audio.playMusic('menu');
        this.lobby = new LobbyView(this.ui, this.client!, { offline: this.offline, leave: () => void this.leave() });
      }
      this.lobby.update(s);
      return;
    }
    if (this.view !== 'match') {
      this.setView('match');
      audio.playMusic('match');
      this.match = new MatchView(this.client!, this.screen);
    }
    audio.duck(s.match.phase === 'MICROGAME');
    audio.setTempo(s.match.round?.tempo ?? 1);
    this.renderMatchHud(s);
  }

  /** Small overlay during a match: audio, quit, stop (host), back to lobby on the final ranking. */
  private renderMatchHud(s: RoomSnapshot): void {
    const isHost = s.lobby.hostId === this.client?.playerId;
    const results = s.match.phase === 'STAGE_RESULTS';
    const key = `${isHost}:${results}`;
    if (key === this.lastHudKey) return;
    this.lastHudKey = key;
    this.hudToggles?.dispose();
    this.hudToggles = audioToggles('small');
    this.hud.replaceChildren(
      this.hudToggles.el,
      confirmButton('QUITTER', 'SÛR ?', () => void this.leave()),
      isHost && !results ? confirmButton('STOP', 'STOP POUR TOUS ?', () => void this.client?.abortMatch().catch(() => {})) : '',
    );
    this.ui.replaceChildren(
      results
        ? h(
            'div',
            { class: 'results-bar' },
            isHost
              ? h('button', { type: 'button', class: 'btn btn--yellow', onclick: () => void this.client?.returnToLobby().catch(() => {}) }, 'RETOUR AU SALON')
              : h('p', { class: 'note' }, "L'hôte relance la partie…"),
          )
        : '',
    );
  }

  private setView(view: View): void {
    this.disposeView?.();
    this.disposeView = null;
    if (view !== 'lobby') {
      this.lobby?.dispose();
      this.lobby = null;
    }
    if (view !== 'match') {
      this.match?.dispose();
      this.match = null;
      this.hudToggles?.dispose();
      this.hudToggles = null;
      this.lastHudKey = '';
      audio.duck(false);
      audio.setTempo(1);
    }
    this.view = view;
    document.body.classList.toggle('in-match', view === 'match');
    this.hud.hidden = view !== 'match';
    if (view !== 'lobby') this.ui.replaceChildren();
  }

  // ─── Connection ────────────────────────────────────────────────────────────

  private newPlayer(): { nickname: string; characterId?: string } {
    const profile = loadProfile();
    const check = checkNickname(profile.nickname);
    const nickname = check.ok ? check.nickname : DEFAULT_NICKNAMES[Math.floor(Math.random() * DEFAULT_NICKNAMES.length)]!;
    if (!check.ok) saveProfile({ ...profile, nickname });
    const characterId = profile.characterId && assets.hasCharacter(profile.characterId) ? profile.characterId : undefined;
    return characterId ? { nickname, characterId } : { nickname };
  }

  private async connect(): Promise<void> {
    if (this.client?.status === 'connected') return;
    this.teardown();
    const params = new URLSearchParams(location.search);
    const url = params.get('server') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const client = new BoucanClient({ url, clientName: 'boucan-web/2', sessionStore, validateIncoming: import.meta.env.DEV });
    this.bind(client);
    await client.connect();
  }

  private async startOffline(player: { nickname: string; characterId?: string }): Promise<void> {
    this.teardown();
    const { createLocalGame } = await import('@boucan/sdk/local');
    const game = await createLocalGame({ bots: 3, ...offlineOptions(new URLSearchParams(location.search)), ...player });
    this.disposeLocal = () => game.dispose();
    this.bind(game.client);
    const snap = game.client.snapshot;
    if (snap) this.onSnapshot(snap);
  }

  private bind(client: BoucanClient): void {
    this.client = client;
    client.on('snapshot', (s) => this.onSnapshot(s));
    client.on('sessionEnded', (reason) => client === this.client && this.ended(reason));
    client.on('status', (status) => {
      if (client !== this.client) return; // an old connection being closed on purpose
      if (status === 'reconnecting' && this.view !== 'menu') toast(document.body, 'Connexion perdue… reconnexion');
      if (status === 'closed' && this.view !== 'menu') {
        this.teardown();
        this.showMenu('La connexion au serveur a été perdue.');
      }
    });
    client.on('error', (e) => {
      if (e.category === 'protocol' || e.category === 'server') console.warn('[boucan]', e);
    });
  }

  private ended(reason: SessionEndReason): void {
    const text: Record<SessionEndReason, string> = {
      kicked: "L'hôte t'a retiré de la partie.",
      replaced: 'La partie a été ouverte dans un autre onglet.',
      expired: 'Ta place dans la partie a expiré.',
      roomClosed: 'La partie est terminée.',
    };
    this.teardown();
    this.showMenu(text[reason]);
  }

  private async leave(): Promise<void> {
    try {
      if (!this.disposeLocal) await this.client?.leaveRoom();
    } catch {
      // already gone
    }
    this.teardown();
    this.showMenu();
  }

  private teardown(): void {
    const client = this.client;
    this.client = null;
    client?.disconnect();
    this.disposeLocal?.();
    this.disposeLocal = null;
  }
}

/**
 * Test aids of the offline mode (same idea as BOUCAN_MICROGAMES on the server):
 *   ?offline&games=boxe,skate   only these microgames (a solo one is added if none)
 *   &duelEvery=1                a duel every N microgames
 *   &bots=5                     number of bots (0–7)
 */
function offlineOptions(q: URLSearchParams): { bots?: number; config?: { microgames?: { enabled: string[] }; rhythm?: { duelEvery: number } } } {
  const games = (q.get('games') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => microgameInfo(id));
  const duelEvery = Number(q.get('duelEvery'));
  const bots = Number(q.get('bots'));
  if (games.length > 0 && !games.some((id) => microgameInfo(id)?.kind === 'solo')) games.push('cours');
  return {
    ...(q.has('bots') && Number.isInteger(bots) && { bots: Math.max(0, Math.min(7, bots)) }),
    config: {
      ...(games.length > 0 && { microgames: { enabled: games } }),
      ...(Number.isInteger(duelEvery) && duelEvery >= 0 && q.has('duelEvery') && { rhythm: { duelEvery } }),
    },
  };
}
