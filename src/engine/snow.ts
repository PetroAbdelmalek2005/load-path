// Roof snow load S = Is[Ss(Cb·Cw·Cs·Ca) + Sr] (OBC Div. B 4.1.6.2, unverified).
import type { CodeValues } from './types';
import { Uses, type Traced } from './trace';

/** Slope factor Cs for non-slippery roofs, from the code-value rule. */
export function slopeFactor(slopeDeg: number, cv: CodeValues, uses: Uses): number {
  const r = uses.cv(cv.snowCsRule);
  if (slopeDeg <= r.flatUpToDeg) return 1.0;
  if (slopeDeg >= r.zeroAtDeg) return 0;
  return (r.zeroAtDeg - slopeDeg) / (r.zeroAtDeg - r.flatUpToDeg);
}

/** Snow before the importance factor, kPa. The engine applies Is (ULS or SLS) per check. */
export function snowBeforeIs(Ss: number, Sr: number, slopeDeg: number, cv: CodeValues): Traced {
  const uses = new Uses();
  const Cb = uses.cv(cv.snowCb);
  const Cw = uses.cv(cv.snowCw);
  const Ca = uses.cv(cv.snowCa);
  const Cs = slopeFactor(slopeDeg, cv, uses);
  const value = Ss * (Cb * Cw * Cs * Ca) + Sr;
  return {
    label: 'Roof snow before importance factor',
    formula: 'S/Is = Ss·(Cb·Cw·Cs·Ca) + Sr',
    inputs: [
      { symbol: 'Ss', value: Ss, units: 'kPa' },
      { symbol: 'Sr', value: Sr, units: 'kPa' },
      { symbol: 'Cb', value: Cb, units: '-', codeKey: cv.snowCb.key, verified: cv.snowCb.verified },
      { symbol: 'Cw', value: Cw, units: '-', codeKey: cv.snowCw.key, verified: cv.snowCw.verified },
      { symbol: 'Cs', value: Cs, units: '-', codeKey: cv.snowCsRule.key, verified: cv.snowCsRule.verified },
      { symbol: 'Ca', value: Ca, units: '-', codeKey: cv.snowCa.key, verified: cv.snowCa.verified },
    ],
    value,
    units: 'kPa',
    clause: cv.snowCb.ref,
    unverified: uses.list(),
  };
}
