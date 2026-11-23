// Acceptance test N: applied loads must equal support reactions, per pattern, within 0.01 %.
import type { Pattern } from './types';
import type { LoadSetResult } from './solver/beam';

export const EQUILIBRIUM_TOLERANCE = 1e-4; // 0.01 %

export interface EquilibriumResult {
  pattern: Pattern;
  appliedForce: number; // kN, downward positive
  reactionForce: number; // kN, upward positive
  forceError: number; // relative
  momentError: number; // relative to applied force × member length
  ok: boolean;
}

export function checkEquilibrium(pattern: Pattern, results: LoadSetResult[], length: number): EquilibriumResult {
  let F = 0;
  let M0 = 0;
  let R = 0;
  let RM = 0;
  let scale = 0;
  for (const r of results) {
    F += r.applied.F;
    M0 += r.applied.M0;
    for (const s of r.reactions) {
      R += s.V;
      RM += s.V * s.x + s.M; // counter-clockwise reaction moments about x = 0
      scale += Math.abs(s.V);
    }
  }
  const ref = Math.max(Math.abs(F), scale / 2, 1e-9);
  const forceError = Math.abs(F - R) / ref;
  const momentError = Math.abs(M0 - RM) / (ref * Math.max(length, 1e-9));
  const zero = Math.abs(F) < 1e-12 && scale < 1e-9;
  return {
    pattern,
    appliedForce: F,
    reactionForce: R,
    forceError: zero ? 0 : forceError,
    momentError: zero ? 0 : momentError,
    ok: zero || (forceError <= EQUILIBRIUM_TOLERANCE && momentError <= EQUILIBRIUM_TOLERANCE),
  };
}
