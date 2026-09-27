import { GAME_RULES } from '@boucan/shared';
import { audio } from '../engine/audio';
import { audioToggles } from './audio-toggles';
import { h, waitForUiFont } from './dom';
import { boucanLogo } from './logo';
import { checkRoomCode, errorMessage, ROOM_CODE_MESSAGES } from './room-code';

export interface MenuActions {
  create(): Promise<void>;
  join(code: string): Promise<void>;
}

const CREATE_LABEL = 'CRÉER UNE PARTIE';

/**
 * Main menu. Real DOM, no bitmaps: corridor backdrop, vector logo, buttons
 * drawn in CSS with text labels, real input. Audio toggles sit in the top
 * right corner of the screen.
 *
 *                                        [♪][🔊]
 *                 ✦ BOUCAN ✦
 *
 *           [   CRÉER UNE PARTIE   ]
 *           [ code...  ][REJOINDRE ]
 */
export function renderMenu(root: HTMLElement, actions: MenuActions, message?: string): () => void {
  const feedback = h('p', { class: 'menu__feedback', id: 'menu-feedback', role: 'alert', 'aria-live': 'assertive', hidden: true });
  const createLabel = h('span', { class: 'menu-btn__label' }, CREATE_LABEL);
  const create = h('button', { type: 'button', class: 'menu-btn menu-btn--create' }, createLabel);
  const input = h('input', {
    type: 'text',
    class: 'join__input',
    maxlength: GAME_RULES.roomCode.length + 4,
    placeholder: 'Code de partie',
    'aria-label': 'Code de partie',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    enterkeyhint: 'go',
    value: new URLSearchParams(location.search).get('room') ?? '',
  });
  const send = h('button', { type: 'submit', class: 'menu-btn menu-btn--join' }, h('span', { class: 'menu-btn__label' }, 'REJOINDRE'));
  const join = h('form', { class: 'join', novalidate: true, 'aria-label': 'Rejoindre une partie' }, input, send);
  const toggles = audioToggles('large');

  const show = (text: string, anchor: 'create' | 'join') => {
    feedback.textContent = text;
    feedback.dataset.anchor = anchor;
    feedback.hidden = false;
    const target = anchor === 'join' ? join : create;
    target.classList.remove('is-shaking');
    void target.offsetWidth; // restart the animation
    target.classList.add('is-shaking');
  };
  const joinError = (on: boolean) => {
    join.classList.toggle('has-error', on);
    if (on) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', 'menu-feedback');
    } else {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    }
  };
  const clear = () => {
    feedback.hidden = true;
    joinError(false);
  };
  if (message) show(message, 'create');

  let busy = false;
  const run = async (fn: () => Promise<void>, anchor: 'create' | 'join') => {
    if (busy) return;
    busy = true;
    clear();
    audio.unlock();
    audio.sfx('select');
    create.disabled = true;
    send.disabled = true;
    input.readOnly = true;
    const target = anchor === 'create' ? create : send;
    target.setAttribute('aria-busy', 'true');
    if (anchor === 'create') createLabel.textContent = 'CRÉATION…';
    try {
      await fn();
    } catch (error) {
      show(errorMessage(error), anchor);
      if (anchor === 'join') joinError(true);
    } finally {
      busy = false;
      create.disabled = false;
      send.disabled = false;
      input.readOnly = false;
      target.removeAttribute('aria-busy');
      createLabel.textContent = CREATE_LABEL;
    }
  };

  create.addEventListener('click', () => void run(() => actions.create(), 'create'));
  join.addEventListener('submit', (e) => {
    e.preventDefault();
    const check = checkRoomCode(input.value);
    if (!check.ok) {
      audio.unlock();
      audio.sfx('hurt');
      joinError(true);
      show(ROOM_CODE_MESSAGES[check.reason], 'join');
      input.focus();
      return;
    }
    input.value = check.code;
    void run(() => actions.join(check.code), 'join');
  });
  input.addEventListener('input', () => {
    const upper = input.value.toUpperCase();
    if (upper !== input.value) input.value = upper;
    if (!feedback.hidden) clear();
  });

  const screen = h(
    'div',
    { class: 'screen screen--menu is-loading' },
    h(
      'main',
      { class: 'stage menu', 'aria-label': 'Menu principal BOUCAN' },
      h('h1', { class: 'menu__title' }, boucanLogo('menu__logo')),
      h('div', { class: 'menu__actions' }, create, join, feedback),
    ),
    h('div', { class: 'menu__audio' }, toggles.el),
  );
  root.replaceChildren(screen);
  // The title and labels are Luckiest Guy: reveal the menu (and play its entrance) once the font is there.
  void waitForUiFont().then(() => screen.classList.remove('is-loading'));
  return () => toggles.dispose();
}
