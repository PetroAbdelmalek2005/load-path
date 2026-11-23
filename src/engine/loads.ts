// Helpers for member loads: clipping to a span, resultants, discontinuity points.
import type { LineLoad, MemberLoad, MomentLoad, Pattern, PointLoad } from './types';

const EPS = 1e-9;

/** Intensity of a line load at x (kN/m). Linear between (x1, w1) and (x2, w2). */
export function lineIntensity(l: LineLoad, x: number): number {
  if (l.x2 - l.x1 < EPS) return 0;
  const t = (x - l.x1) / (l.x2 - l.x1);
  return l.w1 + t * (l.w2 - l.w1);
}

/**
 * Part of a load that falls in the interval [a, b].
 * Point loads and moments belong to [a, b) — except at the member end, where `closedRight` includes b.
 */
export function clipLoad(load: MemberLoad, a: number, b: number, closedRight: boolean): MemberLoad | null {
  if (load.shape === 'line') {
    const x1 = Math.max(load.x1, a);
    const x2 = Math.min(load.x2, b);
    if (x2 - x1 < EPS) return null;
    return { ...load, x1, x2, w1: lineIntensity(load, x1), w2: lineIntensity(load, x2) };
  }
  const x = load.x;
  const inside = x >= a - EPS && (x < b - EPS || (closedRight && x <= b + EPS));
  return inside ? load : null;
}

/** Vertical resultant of a load, kN (downward positive). Moments give zero. */
export function resultant(load: MemberLoad): number {
  if (load.shape === 'line') return ((load.w1 + load.w2) / 2) * (load.x2 - load.x1);
  if (load.shape === 'point') return load.P;
  return 0;
}

/** Sum of absolute vertical resultants. Used for the total-load KD and for equilibrium tolerances. */
export function totalVertical(loads: MemberLoad[]): number {
  return loads.reduce((s, l) => s + Math.abs(resultant(l)), 0);
}

export function byPattern(loads: MemberLoad[], p: Pattern): MemberLoad[] {
  return loads.filter((l) => l.pattern === p);
}

/** Every x where a load starts, stops or acts. The mesh must have a node at each. */
export function discontinuities(loads: MemberLoad[]): number[] {
  const xs: number[] = [];
  for (const l of loads) {
    if (l.shape === 'line') xs.push(l.x1, l.x2);
    else xs.push(l.x);
  }
  return xs;
}

export function isLine(l: MemberLoad): l is LineLoad {
  return l.shape === 'line';
}
export function isPoint(l: MemberLoad): l is PointLoad {
  return l.shape === 'point';
}
export function isMoment(l: MemberLoad): l is MomentLoad {
  return l.shape === 'moment';
}
