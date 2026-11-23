import { buildCodeValues, projectDefaults } from '../src/model/codeValues';
import type { MemberInput, MemberLoad, Pattern, Support, SupportType } from '../src/engine/types';

export const cv = buildCodeValues();
export const settings = (() => {
  const d = projectDefaults();
  return { cantileverDeflectionMultiplier: d.cantileverDeflectionMultiplier, defaultBearingLength: d.defaultBearingLength, maxSpans: d.maxSpans };
})();

let n = 0;
export const udl = (pattern: Pattern, w: number, x1: number, x2: number, w2 = w): MemberLoad => ({
  id: `l${n++}`,
  pattern,
  label: `${pattern} line`,
  shape: 'line',
  x1,
  x2,
  w1: w,
  w2,
});
export const point = (pattern: Pattern, P: number, x: number): MemberLoad => ({ id: `p${n++}`, pattern, label: `${pattern} point`, shape: 'point', x, P });
export const moment = (pattern: Pattern, M: number, x: number): MemberLoad => ({ id: `m${n++}`, pattern, label: `${pattern} moment`, shape: 'moment', x, M });
export const sup = (id: string, x: number, type: SupportType = 'pin', bearingLength: number | null = 89): Support => ({ id, x, type, bearingLength });

/** Shared section for tests A, B and D: 3-ply 2x10 SPF No.1/No.2, braced. */
export function member(length: number, supports: Support[], loads: MemberLoad[], over: Partial<MemberInput> = {}): MemberInput {
  return {
    length,
    supports,
    section: { species: 'SPF No.1/No.2', size: '2x10', plies: 3 },
    compressionEdgeBraced: true,
    wetOrExterior: false,
    includeSelfWeight: true,
    loads,
    settings,
    ...over,
  };
}

export const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
/** Assert within tolerance (default 0.5 %). */
export function near(actual: number, expected: number, tol = 0.005): void {
  if (rel(actual, expected) > tol) throw new Error(`Expected ${expected}, got ${actual} (diff ${(rel(actual, expected) * 100).toFixed(3)} %)`);
}
