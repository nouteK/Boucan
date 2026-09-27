/** Tiny DOM helper: h('button', { class: 'primary', onclick }, 'Texte'). */
type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

/** Inline SVG from trusted markup (icons, logo), parsed in the SVG namespace. */
export function svg(markup: string): SVGSVGElement {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const el = template.content.firstElementChild;
  if (!(el instanceof SVGSVGElement)) throw new Error('svg(): markup must be a single <svg> element');
  return el;
}

const UI_FONT = '400 40px "Luckiest Guy"';
/** Longest wait for the display font: past it, the fallback font beats a blank screen. */
const UI_FONT_WAIT_MS = 2500;

/** Resolves once Luckiest Guy is usable (immediately if it already is), or after UI_FONT_WAIT_MS. */
export function waitForUiFont(): Promise<void> {
  const fonts = document.fonts;
  if (!fonts || fonts.check(UI_FONT)) return Promise.resolve();
  return Promise.race([
    fonts.load(UI_FONT).then(
      () => undefined,
      () => undefined,
    ),
    new Promise<void>((resolve) => setTimeout(resolve, UI_FONT_WAIT_MS)),
  ]);
}

/**
 * Button that asks for a second tap before acting ("QUITTER" → "SÛR ?").
 * Avoids native confirm() dialogs, which break the game's look and block the page.
 */
export function confirmButton(label: string, confirmLabel: string, action: () => void, className = 'btn'): HTMLButtonElement {
  let armed: ReturnType<typeof setTimeout> | null = null;
  const button = h('button', { type: 'button', class: className }, label);
  button.addEventListener('click', () => {
    if (armed) {
      clearTimeout(armed);
      armed = null;
      button.textContent = label;
      button.classList.remove('is-armed');
      action();
      return;
    }
    button.textContent = confirmLabel;
    button.classList.add('is-armed');
    armed = setTimeout(() => {
      armed = null;
      button.textContent = label;
      button.classList.remove('is-armed');
    }, 3000);
  });
  return button;
}

export function toast(parent: HTMLElement, text: string, ms = 2800): void {
  const el = h('div', { class: 'toast', role: 'status' }, text);
  parent.append(el);
  setTimeout(() => el.remove(), ms);
}

const PROFILE_KEY = 'boucan.profile';

export interface Profile {
  nickname: string;
  characterId: string | null;
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return { nickname: '', characterId: null, ...(JSON.parse(raw) as Partial<Profile>) };
  } catch {
    // storage unavailable
  }
  return { nickname: '', characterId: null };
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    // storage unavailable
  }
}
