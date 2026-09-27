import { assets } from './assets';

/**
 * Game audio, two independent channels the player controls:
 *
 *   MUSIQUE : background tracks (manifest "music": { menu, match }) and the
 *             interlude jingles / fanfares.
 *   SONS    : every sound effect. Synthesised (WebAudio) so the game is never
 *             silent; any of them can be replaced by a file declared in
 *             manifest.json ("sounds": { "win": "audio/win.mp3", ... }).
 *
 * Preferences are saved in localStorage and shared by every screen.
 */
export type SfxName =
  | 'tap'
  | 'go'
  | 'win'
  | 'lose'
  | 'tick'
  | 'boom'
  | 'speedup'
  | 'boss'
  | 'levelup'
  | 'duel'
  | 'hurt'
  | 'jump'
  | 'pop'
  | 'whoosh'
  | 'fanfare'
  | 'select'
  | 'hit'
  | 'block'
  | 'splash';

export type MusicTrack = 'menu' | 'match';

export interface AudioPrefs {
  music: boolean;
  sfx: boolean;
}

const PREFS_KEY = 'boucan.audio';
const MUSIC_VOLUME = 0.55;
const DUCKED_VOLUME = 0.22;

export function loadAudioPrefs(storage: Pick<Storage, 'getItem'> | null = safeStorage()): AudioPrefs {
  try {
    const raw = storage?.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<AudioPrefs>;
      return { music: p.music !== false, sfx: p.sfx !== false };
    }
  } catch {
    // corrupted or unavailable storage: defaults
  }
  return { music: true, sfx: true };
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

class Audio {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer | null>();
  private listeners = new Set<(prefs: AudioPrefs) => void>();
  private track: HTMLAudioElement | null = null;
  private trackName: MusicTrack | null = null;
  private wanted: MusicTrack | null = null;
  private ducked = false;
  private rate = 1;
  prefs: AudioPrefs = loadAudioPrefs();

  /** Must be called from a user gesture (browser autoplay policy). Idempotent. */
  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.sfxBus = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.sfxBus.connect(this.ctx.destination);
        this.musicBus.connect(this.ctx.destination);
        this.applyGains();
      } catch {
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.syncMusic();
  }

  // ─── Preferences ───────────────────────────────────────────────────────────

  setMusic(on: boolean): void {
    this.update({ ...this.prefs, music: on });
  }

  setSfx(on: boolean): void {
    this.update({ ...this.prefs, sfx: on });
  }

  /** Called with the new preferences each time they change (keeps every toggle in sync). */
  onChange(listener: (prefs: AudioPrefs) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private update(prefs: AudioPrefs): void {
    this.prefs = prefs;
    try {
      safeStorage()?.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // storage unavailable: preferences last for this visit only
    }
    this.applyGains();
    this.syncMusic();
    for (const l of this.listeners) l(prefs);
  }

  private applyGains(): void {
    if (this.sfxBus) this.sfxBus.gain.value = this.prefs.sfx ? 0.8 : 0;
    if (this.musicBus) this.musicBus.gain.value = this.prefs.music ? 0.8 : 0;
  }

  // ─── Music ─────────────────────────────────────────────────────────────────

  /** Background track to play (null = silence). Starts once audio is unlocked and music is ON. */
  playMusic(track: MusicTrack | null): void {
    this.wanted = track;
    this.syncMusic();
  }

  /** Lower the music while a microgame is running. */
  duck(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    if (this.track) this.track.volume = on ? DUCKED_VOLUME : MUSIC_VOLUME;
  }

  /** Speeds the track up with the game tempo (pitch rises, WarioWare-style). */
  setTempo(tempo: number): void {
    this.rate = Math.min(1.35, Math.max(0.8, tempo));
    if (this.track) this.track.playbackRate = this.rate;
  }

  private syncMusic(): void {
    const path = this.wanted ? assets.music[this.wanted] : undefined;
    const shouldPlay = !!this.ctx && this.prefs.music && !!path;
    if (!shouldPlay) {
      this.track?.pause();
      return;
    }
    if (this.trackName !== this.wanted || !this.track) {
      this.track?.pause();
      const el = new window.Audio(`${import.meta.env.BASE_URL}assets/${path}`);
      el.loop = true;
      el.preload = 'auto';
      (el as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch = false;
      this.track = el;
      this.trackName = this.wanted;
    }
    this.track.volume = this.ducked ? DUCKED_VOLUME : MUSIC_VOLUME;
    this.track.playbackRate = this.rate;
    if (this.track.paused) void this.track.play().catch(() => {});
  }

  // ─── Effects ───────────────────────────────────────────────────────────────

  private beep(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.08, when = 0, slide = 0, bus = this.sfxBus): void {
    const ctx = this.ctx;
    if (!ctx || !bus) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const gn = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol = 0.12, when = 0, lowpass = 1200, bus = this.sfxBus): void {
    const ctx = this.ctx;
    if (!ctx || !bus) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    const gn = ctx.createGain();
    gn.gain.value = vol;
    src.connect(f).connect(gn).connect(bus);
    src.start(ctx.currentTime + when);
  }

  /** Plays a sound file declared in the manifest; false if absent or not loaded yet. */
  private file(name: string, bus: GainNode | null): boolean {
    const path = assets.sounds[name];
    const ctx = this.ctx;
    if (!path || !ctx || !bus) return false;
    const cached = this.buffers.get(name);
    if (cached === undefined) {
      this.buffers.set(name, null);
      void fetch(`${import.meta.env.BASE_URL}assets/${path}`)
        .then((r) => r.arrayBuffer())
        .then((b) => ctx.decodeAudioData(b))
        .then((buf) => this.buffers.set(name, buf))
        .catch(() => console.warn(`[audio] cannot load ${path}`));
      return false;
    }
    if (cached === null) return false;
    const src = ctx.createBufferSource();
    src.buffer = cached;
    src.connect(bus);
    src.start();
    return true;
  }

  sfx(name: SfxName): void {
    if (!this.ctx || !this.prefs.sfx) return;
    if (name === 'fanfare') return this.fanfare();
    if (this.file(name, this.sfxBus)) return;
    const b = this.beep.bind(this);
    switch (name) {
      case 'tap':
        return b(520 + Math.random() * 80, 0.05, 'square', 0.05);
      case 'go':
        b(660, 0.08);
        return b(990, 0.14, 'square', 0.08, 0.08);
      case 'win':
        return [523, 659, 784, 1047].forEach((f, i) => b(f, 0.12, 'square', 0.08, i * 0.06));
      case 'lose':
        return [392, 330, 262, 196].forEach((f, i) => b(f, 0.16, 'sawtooth', 0.06, i * 0.08));
      case 'tick':
        return b(1300, 0.03, 'square', 0.05);
      case 'boom':
        this.noise(0.6, 0.25, 0, 900);
        return b(90, 0.5, 'sawtooth', 0.1, 0, 40);
      case 'speedup':
        return [440, 554, 659, 880, 1109, 1319].forEach((f, i) => b(f, 0.09, 'square', 0.07, i * 0.045));
      case 'boss':
        return [196, 196, 233, 262, 196, 311, 294].forEach((f, i) => b(f, 0.2, 'sawtooth', 0.07, i * 0.13));
      case 'levelup':
        return [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => b(f, 0.1, 'triangle', 0.1, i * 0.07));
      case 'duel':
        return [330, 0, 330, 440, 392].forEach((f, i) => f && b(f, 0.12, 'square', 0.08, i * 0.1));
      case 'hurt':
        return b(160, 0.18, 'square', 0.1, 0, 90);
      case 'jump':
        return b(300, 0.18, 'square', 0.07, 0, 900);
      case 'pop':
        return b(800, 0.06, 'triangle', 0.1, 0, 300);
      case 'whoosh':
        return this.noise(0.25, 0.08, 0, 3000);
      case 'hit':
        this.noise(0.08, 0.14, 0, 1800);
        return b(140, 0.09, 'square', 0.09, 0, 70);
      case 'block':
        return b(900, 0.05, 'square', 0.06);
      case 'splash':
        this.noise(0.35, 0.12, 0, 2400);
        return b(420, 0.14, 'triangle', 0.05, 0, 160);
      case 'select':
        return b(700, 0.05, 'triangle', 0.07);
    }
  }

  /** Victory fanfare (music channel). */
  private fanfare(): void {
    if (!this.ctx || !this.prefs.music) return;
    if (this.file('fanfare', this.musicBus)) return;
    [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => this.beep(f, 0.14, 'square', 0.08, i * 0.11, 0, this.musicBus));
  }

  /** Short interlude jingle in the zone's key; faster and higher with the tempo (music channel). */
  jingle(semitones: readonly number[], tempo: number): void {
    if (!this.ctx || !this.prefs.music) return;
    if (this.file('jingle', this.musicBus)) return;
    const base = 440 * 2 ** (((tempo - 1) * 4) / 12);
    const step = 0.11 / tempo;
    semitones.forEach((s, i) => {
      this.beep(base * 2 ** (s / 12), step * 1.4, 'square', 0.07, i * step, 0, this.musicBus);
      if (i % 2 === 0) this.beep((base / 2) * 2 ** (s / 12), step * 1.8, 'triangle', 0.09, i * step, 0, this.musicBus);
    });
    for (let i = 0; i < semitones.length; i += 2) this.noise(0.05, 0.08, i * step, 5000, this.musicBus);
  }
}

export const audio = new Audio();
