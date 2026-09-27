import { svg } from './dom';

/** One letter of the title: glyph, centre x, baseline y, font size, tilt (degrees). */
type Letter = readonly [char: string, x: number, y: number, size: number, tilt: number];

/** Bouncy lettering: every glyph has its own size, baseline and tilt (the letters overlap and fuse into one sticker). */
const LETTERS: readonly Letter[] = [
  ['B', 270, 330, 240, -8],
  ['O', 402, 316, 205, -3],
  ['U', 531, 324, 215, 4],
  ['C', 647, 314, 205, -4],
  ['A', 766, 322, 225, 3],
  ['N', 917, 330, 240, 6],
];
/** Luckiest Guy cap height as a fraction of the font size (rotation pivot = middle of the capitals). */
const CAP_HEIGHT = 0.715;

/** Counter of the O (x, y, radius): too small for the outlines, so it is inked instead of showing a speck of band colour. */
const O_COUNTER = [402, 243, 10] as const;

/** Crown on the N: outline around (0, 0) = middle of its base, then placed and tilted. */
const CROWN = { at: [948, 170], tilt: 14, points: [[-58, 0], [-72, -74], [-30, -40], [0, -100], [30, -40], [72, -74], [58, 0]] } as const;

/** Burst rays on each side: centre, angles (degrees); inner / outer radius and half-width. */
const RAYS = { left: [270, 250, [150, 180, 210]], right: [917, 250, [-30, 0, 30]], r0: 150, r1: 238, w0: 14, w1: 24 } as const;

/** Outline widths (outer ink, colour band, inner ink), in logo units. */
const OUTER = 58;
const BAND = 42;
const INNER = 18;
/** Visible area: rays, crown, outlines and shadow included. */
const VIEWBOX = '24 40 1140 360';

let instances = 0;

/** Crown outline in logo coordinates (gradients must not follow a local transform). */
function crownPath(): string {
  const [cx, cy] = CROWN.at;
  const a = (CROWN.tilt * Math.PI) / 180;
  const pts = CROWN.points.map(([x, y]) => `${(cx + x * Math.cos(a) - y * Math.sin(a)).toFixed(1)} ${(cy + x * Math.sin(a) + y * Math.cos(a)).toFixed(1)}`);
  return `M${pts.join(' L')} Z`;
}

/**
 * The BOUCAN title as live vector art: sharp at any size and pixel density,
 * no bitmap. Letters are real text in Luckiest Guy drawn in stacked layers
 * (low shadow, outer ink, blue → red → yellow band, inner ink, white face),
 * with the burst rays and the crown of the menu kit.
 * Needs Luckiest Guy to be loaded, otherwise it shows in the fallback font
 * (see waitForUiFont).
 */
export function boucanLogo(className: string): SVGSVGElement {
  const id = `boucan-logo-${++instances}`;
  const letters = LETTERS.map(
    ([char, x, y, size, tilt]) =>
      `<text x="${x}" y="${y}" font-size="${size}" transform="rotate(${tilt} ${x} ${y - (size * CAP_HEIGHT) / 2})">${char}</text>`,
  ).join('');
  const rays = ([cx, cy, angles]: readonly [number, number, readonly number[]]) =>
    angles
      .map(
        (a) =>
          `<polygon transform="translate(${cx} ${cy}) rotate(${a})" points="${RAYS.r0},${-RAYS.w0} ${RAYS.r1},${-RAYS.w1} ${RAYS.r1},${RAYS.w1} ${RAYS.r0},${RAYS.w0}"/>`,
      )
      .join('');
  // Every outline layer draws the letters and the crown together, so they fuse into one shape.
  const shape = (attrs: string) => `<g ${attrs}><use href="#${id}-word"/><use href="#${id}-crown"/></g>`;

  // The band is a gradient painted through a mask of the outline: one continuous
  // sweep across the whole title, whatever the tilt of each letter.
  return svg(`
    <svg class="${className}" viewBox="${VIEWBOX}" role="img" aria-label="BOUCAN">
      <title>BOUCAN</title>
      <defs>
        <g id="${id}-word" font-family="'Luckiest Guy', 'Arial Black', sans-serif" text-anchor="middle">${letters}</g>
        <path id="${id}-crown" d="${crownPath()}"/>
        <linearGradient id="${id}-band" gradientUnits="userSpaceOnUse" x1="230" y1="360" x2="990" y2="140">
          <stop offset="0.18" stop-color="#1377f2"/>
          <stop offset="0.215" stop-color="#f2303a"/>
          <stop offset="0.63" stop-color="#f2303a"/>
          <stop offset="0.69" stop-color="#ffd216"/>
        </linearGradient>
        <mask id="${id}-band-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1200" height="460">
          ${shape(`fill="#fff" stroke="#fff" stroke-width="${BAND}" stroke-linejoin="round"`)}
        </mask>
        <linearGradient id="${id}-face" gradientUnits="userSpaceOnUse" x1="0" y1="170" x2="0" y2="335">
          <stop offset="0.5" stop-color="#ffffff"/>
          <stop offset="1" stop-color="#dfeaf6"/>
        </linearGradient>
      </defs>
      <g fill="#ffd216" stroke="#111" stroke-width="8" stroke-linejoin="round">${rays(RAYS.left)}${rays(RAYS.right)}</g>
      <g stroke-linejoin="round" stroke-linecap="round">
        ${shape(`transform="translate(0 14)" fill="#000" stroke="#000" stroke-width="${OUTER}" opacity="0.16"`)}
        ${shape(`fill="#111" stroke="#111" stroke-width="${OUTER}"`)}
        <rect x="0" y="0" width="1200" height="460" fill="url(#${id}-band)" mask="url(#${id}-band-mask)"/>
        <use href="#${id}-crown" fill="#ffd216" stroke="#111" stroke-width="${INNER}" paint-order="stroke"/>
        <use href="#${id}-word" fill="#111" stroke="#111" stroke-width="${INNER}"/>
        <circle cx="${O_COUNTER[0]}" cy="${O_COUNTER[1]}" r="${O_COUNTER[2]}" fill="#111"/>
        <use href="#${id}-word" fill="url(#${id}-face)"/>
      </g>
    </svg>`);
}
