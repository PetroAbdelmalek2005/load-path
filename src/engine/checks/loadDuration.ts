// Load duration factor KD (CSA O86 5.3.2, unverified).
// Baher's rules (DECISIONS.md, 2026-11-23):
// - PL = specified dead load (or dead load effect). PS = specified live + snow with a non-zero factor in the combination.
// - Dead load alone: KD = permanent value.
// - Dead and live/snow effects of opposite sign at the section: KD = permanent value.
// - PL > PS: KD = a - b·log10(PL/PS), not less than min. Never above the standard value.
// - Per check, KD is computed from load effects AND from total load; the lower one is used.
import type { CodeValues } from '../types';
import type { Uses } from '../trace';

export interface KDResult {
  KD: number;
  PL: number;
  PS: number;
  rule: 'permanent' | 'dead-dominant' | 'standard';
  formula: string;
}

/** True when the dead and live/snow effects act in opposite directions (both non-zero). */
export function opposite(PL: number, PS: number): boolean {
  return Math.abs(PL) > 1e-12 && Math.abs(PS) > 1e-12 && Math.sign(PL) !== Math.sign(PS);
}

export function kdFrom(PL: number, PS: number, deadOnly: boolean, cv: CodeValues, uses: Uses): KDResult {
  const PLa = Math.abs(PL);
  const PSa = Math.abs(PS);
  const standard = uses.cv(cv.kdStandard);
  if (deadOnly || PSa <= 1e-12) {
    const KD = uses.cv(cv.kdPermanent);
    return { KD, PL: PLa, PS: PSa, rule: 'permanent', formula: 'Dead load only: KD = permanent value' };
  }
  if (opposite(PL, PS)) {
    const KD = uses.cv(cv.kdPermanent);
    return {
      KD,
      PL: PLa,
      PS: PSa,
      rule: 'permanent',
      formula: 'Dead and live/snow effects have opposite signs at this section: KD = permanent value',
    };
  }
  if (PLa > PSa) {
    const { a, b, min } = uses.cv(cv.kdDeadDominant);
    const KD = Math.min(standard, Math.max(min, a - b * Math.log10(PLa / PSa)));
    return {
      KD,
      PL: PLa,
      PS: PSa,
      rule: 'dead-dominant',
      formula: `KD = ${a} − ${b}·log10(PL/PS) = ${a} − ${b}·log10(${PLa.toFixed(3)}/${PSa.toFixed(3)}), ≥ ${min}`,
    };
  }
  return { KD: standard, PL: PLa, PS: PSa, rule: 'standard', formula: 'PL ≤ PS: KD = standard value' };
}

export interface GoverningKD {
  KD: number;
  fromEffect: KDResult;
  fromTotal: KDResult;
  used: 'effect' | 'total';
}

/** The lower of the effect-based and total-load KD. */
export function governingKD(effect: KDResult, total: KDResult): GoverningKD {
  return effect.KD <= total.KD
    ? { KD: effect.KD, fromEffect: effect, fromTotal: total, used: 'effect' }
    : { KD: total.KD, fromEffect: effect, fromTotal: total, used: 'total' };
}
