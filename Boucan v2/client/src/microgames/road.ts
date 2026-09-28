import { drawSprite } from '../engine/assets';
import { g, INK } from '../engine/draw';
import { sceneBg } from './backdrops';
import { GY } from './common';

/**
 * The road seen from behind the runner (esquive, skate): a painted road
 * image in perspective, with points on it given by a distance `d` ahead and a
 * lateral position `u` ∈ [−1, 1]. Its geometry lives in a 1280×800 "road
 * space" (the image's), drawn scaled into the 1280×720 view: draw road things
 * between `enterRoad()` and a restore.
 */
const VP = [1608, -54] as const;
const NEAR_L = [150, 770] as const;
const NEAR_R = [1053, 770] as const;
const DEPTH = 300;
const SCALE = 0.9;

export interface RoadPoint {
  x: number;
  y: number;
  /** Perspective factor (1 = near, → 0 far away). */
  p: number;
}

export function roadPoint(d: number, u: number): RoadPoint {
  const p = DEPTH / (DEPTH + d);
  const k = (u + 1) / 2;
  const ox = NEAR_L[0] + (NEAR_R[0] - NEAR_L[0]) * k;
  const oy = NEAR_L[1] + (NEAR_R[1] - NEAR_L[1]) * k;
  return { x: VP[0] + (ox - VP[0]) * p, y: VP[1] + (oy - VP[1]) * p, p };
}

/** Angle of the road's direction at a point (to tilt things along it). */
export function roadAngle(q: RoadPoint): number {
  return Math.atan2(VP[1] - q.y, VP[0] - q.x);
}

/** Switches the canvas to road space (caller saves / restores). */
export function enterRoad(): void {
  const c = g();
  c.translate((1280 * (1 - SCALE)) / 2, 0);
  c.scale(SCALE, SCALE);
}

/**
 * Background, road and the stripes that scroll towards you (`travelled` =
 * distance covered); `dashes` = lateral positions of dashed lane lines.
 */
export function drawRoad(travelled: number, dashes: readonly number[] = []): void {
  const c = g();
  sceneBg('ville', GY);
  c.fillStyle = 'rgba(20,15,40,.22)';
  c.fillRect(0, 0, 1280, 720);
  c.save();
  enterRoad();
  const L0 = roadPoint(-80, -1);
  const R0 = roadPoint(-80, 1);
  const Lf = roadPoint(1e5, -1);
  const Rf = roadPoint(1e5, 1);
  const outline = () => {
    c.beginPath();
    c.moveTo(L0.x, L0.y);
    c.lineTo(Lf.x, Lf.y);
    c.lineTo(Rf.x, Rf.y);
    c.lineTo(R0.x, R0.y);
    c.closePath();
  };
  if (!drawSprite('route', 'route', 0, -106, 68, 798)) {
    outline();
    c.fillStyle = '#8f9ba6';
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 8;
    c.stroke();
  }
  outline();
  c.clip();
  const scroll = travelled % 90;
  for (let k = 0; k < 60; k++) {
    const d = k * 90 - scroll - 60;
    if (d < -80) continue;
    const a = roadPoint(d, -1);
    const b = roadPoint(d, 1);
    if (a.p < 0.06) break;
    c.strokeStyle = `rgba(40,48,60,${0.35 * Math.min(1, a.p * 1.4)})`;
    c.lineWidth = Math.max(1, 7 * a.p);
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
  }
  for (const u of dashes) {
    const a = roadPoint(-80, u);
    const b = roadPoint(3000, u);
    c.setLineDash([26, 22]);
    c.lineDashOffset = -travelled * 0.7;
    c.strokeStyle = 'rgba(255,255,255,.55)';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
    c.setLineDash([]);
  }
  c.restore();
}
