import { audio, type AudioPrefs } from '../engine/audio';
import { h, svg } from './dom';

/** Pictograms drawn in currentColor (no image files). */
const ICONS: Record<keyof AudioPrefs, string> = {
  music:
    '<svg viewBox="0 0 96 96" aria-hidden="true"><path fill="currentColor" d="M39 18v49c0 10-9 17-21 17S0 77 0 68s8-16 20-16c4 0 7 1 10 2V25l50-10v43c0 10-8 17-20 17s-20-7-20-16 8-16 20-16c4 0 7 1 10 2V8z"/></svg>',
  sfx:
    '<svg viewBox="0 0 96 96" aria-hidden="true"><path fill="currentColor" d="M11 38h18l23-19v58L29 58H11z"/><path d="M61 35c8 8 8 18 0 26M69 25c14 14 14 32 0 46" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/></svg>',
};

/**
 * MUSIQUE / SONS toggles. They drive the real audio channels and stay in sync
 * across every screen (menu, lobby, match) through audio.onChange.
 * Returns the element and a dispose function.
 */
export function audioToggles(size: 'large' | 'small' = 'large'): { el: HTMLElement; dispose(): void } {
  const button = (kind: keyof AudioPrefs, label: string) =>
    h(
      'button',
      {
        type: 'button',
        class: 'audio-toggle',
        'aria-label': label,
        title: label,
        onclick: () => {
          audio.unlock();
          if (kind === 'music') audio.setMusic(!audio.prefs.music);
          else audio.setSfx(!audio.prefs.sfx);
          audio.sfx('select');
        },
      },
      svg(ICONS[kind]),
    );
  const music = button('music', 'Musique');
  const sfx = button('sfx', 'Sons');
  const sync = (p: AudioPrefs) => {
    music.setAttribute('aria-pressed', String(p.music));
    sfx.setAttribute('aria-pressed', String(p.sfx));
  };
  sync(audio.prefs);
  const off = audio.onChange(sync);
  return {
    el: h('div', { class: `audio-toggles audio-toggles--${size}`, role: 'group', 'aria-label': 'Audio' }, music, sfx),
    dispose: off,
  };
}
