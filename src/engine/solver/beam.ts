// 1D direct stiffness solver for a straight beam (Euler-Bernoulli, bending only).
// Degrees of freedom per node: v (up positive, m) and θ (counter-clockwise positive, rad).
// Loads: downward positive. Internal moment: sagging positive. Shear: V = dM/dx.

import type { LineLoad, MemberLoad, Support } from '../types';
import { lineIntensity } from '../loads';
import { BandedFactor, BandedMatrix } from './banded';

const TOL = 1e-7; // m, node merge tolerance

// 5-point Gauss rule on [0, 1]. Exact for polynomials up to degree 9.
const G = [0, -0.5384693101056831, 0.5384693101056831, -0.906179845938664, 0.906179845938664];
const GW = [0.5688888888888889, 0.4786286704993665, 0.4786286704993665, 0.2369268850561891, 0.2369268850561891];
export const GAUSS_POINTS = G.map((g, i) => ({ s: (g + 1) / 2, w: GW[i]! / 2 }));

export interface Segment {
  index: number;
  a: number;
  b: number;
  /** 'span' = supported at both ends; 'cantilever' = one end free. */
  kind: 'span' | 'cantilever';
  freeEnd?: 'left' | 'right';
}

export interface BeamMesh {
  length: number;
  /** Sample points for diagrams and checks (at least 200 per span plus every discontinuity). */
  xs: number[];
  /** Finite element nodes: member ends, supports and load discontinuities only. Exact at these nodes. */
  feXs: number[];
  EI: number; // kN·m²
  supports: Support[];
  supportNode: number[];
  segments: Segment[];
  factor: BandedFactor;
  restrainedDofs: number[];
}

/** Span segments between member ends and supports. Overhangs count as segments. */
export function buildSegments(length: number, supports: Support[]): Segment[] {
  const sx = supports.map((s) => s.x);
  const pts: number[] = [];
  for (const x of [0, length, ...sx].sort((p, q) => p - q)) {
    if (pts.length === 0 || x - pts[pts.length - 1]! > TOL) pts.push(x);
  }
  const segs: Segment[] = [];
  const hasSupport = (x: number) => sx.some((s) => Math.abs(s - x) < TOL);
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const la = hasSupport(a);
    const lb = hasSupport(b);
    if (la && lb) segs.push({ index: segs.length, a, b, kind: 'span' });
    else if (la || lb) segs.push({ index: segs.length, a, b, kind: 'cantilever', freeEnd: la ? 'right' : 'left' });
    else
      throw new Error(
        `The member part from ${a.toFixed(3)} m to ${b.toFixed(3)} m has no support at either end. Add a support or shorten the member.`,
      );
  }
  return segs;
}

export function buildMesh(
  length: number,
  supports: Support[],
  loadXs: number[],
  EI: number,
  divisionsPerSpan = 200,
): BeamMesh {
  if (!(length > 0)) throw new Error('Member length must be greater than zero.');
  if (supports.length === 0) throw new Error('The member needs at least one support.');
  for (const s of supports) {
    if (s.x < -TOL || s.x > length + TOL) throw new Error(`Support "${s.id}" at x = ${s.x} m is off the member.`);
  }
  for (let i = 0; i < supports.length; i++)
    for (let j = i + 1; j < supports.length; j++)
      if (Math.abs(supports[i]!.x - supports[j]!.x) < TOL) throw new Error('Two supports are at the same position.');
  for (const x of loadXs) {
    if (x < -TOL || x > length + TOL) throw new Error(`A load at x = ${x} m is off the member (length ${length} m).`);
  }

  const segments = buildSegments(length, supports);

  // Critical points first; grid points only where they don't crowd a critical point.
  const critical: number[] = [];
  const pushUnique = (arr: number[], x: number) => {
    if (!arr.some((c) => Math.abs(c - x) < TOL)) arr.push(x);
  };
  for (const x of [0, length, ...supports.map((s) => s.x), ...loadXs]) pushUnique(critical, Math.min(Math.max(x, 0), length));
  const xs = [...critical];
  for (const seg of segments) {
    for (let k = 1; k < divisionsPerSpan; k++) {
      const x = seg.a + ((seg.b - seg.a) * k) / divisionsPerSpan;
      if (!critical.some((c) => Math.abs(c - x) < TOL * 10)) xs.push(x);
    }
  }
  xs.sort((p, q) => p - q);

  const feXs = [...critical].sort((p, q) => p - q);
  const nodeAt = (x: number) => {
    const i = feXs.findIndex((n) => Math.abs(n - x) < TOL);
    if (i < 0) throw new Error(`No node at x = ${x}`);
    return i;
  };

  const n = feXs.length * 2;
  const K = new BandedMatrix(n, 3);
  for (let e = 0; e + 1 < feXs.length; e++) {
    const k = elementStiffness(EI, feXs[e + 1]! - feXs[e]!);
    const dofs = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let i = 0; i < 4; i++) for (let j = i; j < 4; j++) K.add(dofs[i]!, dofs[j]!, k[i]![j]!);
  }
  const supportNode = supports.map((s) => nodeAt(s.x));
  const restrainedDofs: number[] = [];
  supports.forEach((s, i) => {
    const nd = supportNode[i]!;
    restrainedDofs.push(2 * nd);
    if (s.type === 'fixed') restrainedDofs.push(2 * nd + 1);
  });
  const Kr = K.clone();
  for (const d of restrainedDofs) Kr.restrain(d);
  const factor = new BandedFactor(Kr);

  return { length, xs, feXs, EI, supports, supportNode, segments, factor, restrainedDofs };
}

export function elementStiffness(EI: number, h: number): number[][] {
  const c = EI / h ** 3;
  return [
    [12 * c, 6 * h * c, -12 * c, 6 * h * c],
    [6 * h * c, 4 * h * h * c, -6 * h * c, 2 * h * h * c],
    [-12 * c, -6 * h * c, 12 * c, -6 * h * c],
    [6 * h * c, 2 * h * h * c, -6 * h * c, 4 * h * h * c],
  ];
}

/** Hermite shape functions at s in [0, 1] for element length h. */
function shape(s: number, h: number): [number, number, number, number] {
  return [1 - 3 * s * s + 2 * s ** 3, h * (s - 2 * s * s + s ** 3), 3 * s * s - 2 * s ** 3, h * (-s * s + s ** 3)];
}

export interface SupportReaction {
  supportId: string;
  x: number;
  V: number; // kN, upward positive (force from support on member)
  M: number; // kN·m, counter-clockwise positive (moment from support on member)
}

export interface LoadSetResult {
  /** Deflection at each node, mm, downward positive. */
  defl: Float64Array;
  /** Shear and moment just left (L) and just right (R) of each node. kN and kN·m. */
  VL: Float64Array;
  VR: Float64Array;
  ML: Float64Array;
  MR: Float64Array;
  reactions: SupportReaction[];
  /** Applied vertical load (kN, down positive) and its moment about x = 0 (kN·m, clockwise positive). */
  applied: { F: number; M0: number };
}

/** Index of the node at x in a sorted array (binary search). */
function indexAt(arr: number[], x: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! < x - TOL) lo = mid + 1;
    else hi = mid;
  }
  if (Math.abs(arr[lo]! - x) > TOL) throw new Error(`No node at x = ${x}`);
  return lo;
}

/**
 * Deflection inside a clamped element under a linear load (downward qa -> qb over length h),
 * measured from the chord of the end displacements. Up positive, m.
 */
export function clampedParticular(s: number, h: number, qa: number, qb: number, EI: number): number {
  const dq = qb - qa;
  const A = -(qa * h ** 4 / 24 + (dq * h ** 4) / 120) / EI;
  const B = -(qa * h ** 3 / 6 + (dq * h ** 3) / 24) / EI;
  const c3 = ((2 * A) / h - B) / (h * h);
  const c2 = (-A - c3 * h ** 3) / (h * h);
  return -(qa * s ** 4 / 24 + (dq * s ** 5) / (120 * h)) / EI + c2 * s * s + c3 * s ** 3;
}

/** Solve one set of loads. Loads must have element nodes at their discontinuities. */
export function solveLoadSet(mesh: BeamMesh, loads: MemberLoad[]): LoadSetResult {
  const { xs, feXs, EI } = mesh;
  const nf = feXs.length;
  const F = new Float64Array(nf * 2);
  const lines = loads.filter((l): l is LineLoad => l.shape === 'line');

  // Element intensities (downward, kN/m) at each finite element's ends, and equivalent nodal loads.
  const qa = new Float64Array(nf - 1);
  const qb = new Float64Array(nf - 1);
  for (const l of lines) {
    const i1 = indexAt(feXs, l.x1);
    const i2 = indexAt(feXs, l.x2);
    for (let e = i1; e < i2; e++) {
      const xa = feXs[e]!;
      const xb = feXs[e + 1]!;
      const wa = lineIntensity(l, xa);
      const wb = lineIntensity(l, xb);
      qa[e]! += wa;
      qb[e]! += wb;
      const h = xb - xa;
      // Gauss integration of the shape functions (upward load = -w).
      for (const g of GAUSS_POINTS) {
        const q = -(wa + g.s * (wb - wa));
        const N = shape(g.s, h);
        const f = q * g.w * h;
        F[2 * e]! += N[0] * f;
        F[2 * e + 1]! += N[1] * f;
        F[2 * e + 2]! += N[2] * f;
        F[2 * e + 3]! += N[3] * f;
      }
    }
  }
  let appliedF = 0;
  let appliedM0 = 0;
  for (const l of loads) {
    if (l.shape === 'point') {
      F[2 * indexAt(feXs, l.x)]! -= l.P;
      appliedF += l.P;
      appliedM0 += l.P * l.x;
    } else if (l.shape === 'moment') {
      F[2 * indexAt(feXs, l.x) + 1]! += l.M;
      appliedM0 -= l.M; // CCW applied moment = negative clockwise
    } else {
      const L = l.x2 - l.x1;
      appliedF += ((l.w1 + l.w2) / 2) * L;
      appliedM0 += l.w1 * L * (l.x1 + L / 2) + ((l.w2 - l.w1) * L * (l.x1 + (2 * L) / 3)) / 2;
    }
  }

  const rhs = new Float64Array(F);
  for (const d of mesh.restrainedDofs) rhs[d] = 0;
  const u = mesh.factor.solve(rhs);

  // Reactions R = K u - F at restrained dofs (forces from supports on the member).
  const Ku = new Float64Array(nf * 2);
  for (let e = 0; e + 1 < nf; e++) {
    const k = elementStiffness(EI, feXs[e + 1]! - feXs[e]!);
    const dofs = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let i = 0; i < 4; i++) {
      let sum = 0;
      for (let j = 0; j < 4; j++) sum += k[i]![j]! * u[dofs[j]!]!;
      Ku[dofs[i]!]! += sum;
    }
  }
  const reactions: SupportReaction[] = mesh.supports.map((sp, i) => {
    const nd = mesh.supportNode[i]!;
    return {
      supportId: sp.id,
      x: sp.x,
      V: Ku[2 * nd]! - F[2 * nd]!,
      M: sp.type === 'fixed' ? Ku[2 * nd + 1]! - F[2 * nd + 1]! : 0,
    };
  });

  // ---- Sample points: shear and moment by statics, walking from the left. Exact for linear loads. ----
  const ns = xs.length;
  const nodeP = new Float64Array(ns);
  const nodeM = new Float64Array(ns);
  const rV = new Float64Array(ns);
  const rM = new Float64Array(ns);
  const sqa = new Float64Array(ns - 1);
  const sqb = new Float64Array(ns - 1);
  for (const l of loads) {
    if (l.shape === 'point') nodeP[indexAt(xs, l.x)]! += l.P;
    else if (l.shape === 'moment') nodeM[indexAt(xs, l.x)]! += l.M;
    else {
      const i1 = indexAt(xs, l.x1);
      const i2 = indexAt(xs, l.x2);
      for (let e = i1; e < i2; e++) {
        sqa[e]! += lineIntensity(l, xs[e]!);
        sqb[e]! += lineIntensity(l, xs[e + 1]!);
      }
    }
  }
  reactions.forEach((r) => {
    const i = indexAt(xs, r.x);
    rV[i]! += r.V;
    rM[i]! += r.M;
  });
  const VL = new Float64Array(ns);
  const VR = new Float64Array(ns);
  const ML = new Float64Array(ns);
  const MR = new Float64Array(ns);
  let V = 0;
  let M = 0;
  for (let i = 0; i < ns; i++) {
    VL[i] = V;
    ML[i] = M;
    V += rV[i]! - nodeP[i]!;
    M += -rM[i]! - nodeM[i]!; // CCW moments on the member reduce sagging to their right
    VR[i] = V;
    MR[i] = M;
    if (i + 1 < ns) {
      const h = xs[i + 1]! - xs[i]!;
      const a = sqa[i]!;
      const b = sqb[i]!;
      M += V * h - (h * h * (2 * a + b)) / 6;
      V -= ((a + b) / 2) * h;
    }
  }

  // ---- Deflection at sample points: Hermite interpolation of element end values + exact clamped part. ----
  const defl = new Float64Array(ns);
  let e = 0;
  for (let i = 0; i < ns; i++) {
    const x = xs[i]!;
    while (e < nf - 2 && x > feXs[e + 1]! + TOL) e++;
    const xa = feXs[e]!;
    const h = feXs[e + 1]! - xa;
    const s = Math.min(Math.max((x - xa) / h, 0), 1);
    const N = shape(s, h);
    const v =
      N[0] * u[2 * e]! + N[1] * u[2 * e + 1]! + N[2] * u[2 * e + 2]! + N[3] * u[2 * e + 3]! +
      clampedParticular(s * h, h, qa[e]!, qb[e]!, EI);
    defl[i] = -v * 1000;
  }

  return { defl, VL, VR, ML, MR, reactions, applied: { F: appliedF, M0: appliedM0 } };
}
