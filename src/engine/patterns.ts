// Pattern loading: every on/off arrangement of live and snow by span segment.
// Dead load is always on every span. Each pattern solve uses unfactored loads; combinations
// are built later by superposition (the beam is linear).
import type { MemberLoad, Pattern } from './types';
import { clipLoad, resultant } from './loads';
import type { BeamMesh, LoadSetResult, Segment } from './solver/beam';
import { solveLoadSet } from './solver/beam';

export interface UnitCases {
  segments: Segment[];
  /** Dead load on all spans. */
  D: LoadSetResult;
  /** One result per segment, for live and snow (snow before Is). */
  L: LoadSetResult[];
  S: LoadSetResult[];
  /** Sum of |vertical resultant| per segment (kN), for the total-load KD. */
  totals: { D: number; L: number[]; S: number[] };
  has: { L: boolean; S: boolean };
}

export function splitBySegment(loads: MemberLoad[], segments: Segment[]): MemberLoad[][] {
  return segments.map((seg, i) =>
    loads.map((l) => clipLoad(l, seg.a, seg.b, i === segments.length - 1)).filter((l): l is MemberLoad => l !== null),
  );
}

export function solveUnitCases(mesh: BeamMesh, loads: MemberLoad[]): UnitCases {
  const segs = mesh.segments;
  const of = (p: Pattern) => loads.filter((l) => l.pattern === p);
  const D = solveLoadSet(mesh, of('D'));
  const Lparts = splitBySegment(of('L'), segs);
  const Sparts = splitBySegment(of('S'), segs);
  const sumAbs = (ls: MemberLoad[]) => ls.reduce((s, l) => s + Math.abs(resultant(l)), 0);
  return {
    segments: segs,
    D,
    L: Lparts.map((p) => solveLoadSet(mesh, p)),
    S: Sparts.map((p) => solveLoadSet(mesh, p)),
    totals: { D: sumAbs(of('D')), L: Lparts.map(sumAbs), S: Sparts.map(sumAbs) },
    has: { L: of('L').length > 0, S: of('S').length > 0 },
  };
}

/** Segment indices that are loaded in a mask. */
export function maskSpans(mask: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (mask & (1 << i)) out.push(i);
  return out;
}

/** Summed result arrays for every mask (2^n), built incrementally. */
export interface MaskSums {
  defl: Float64Array[];
  VL: Float64Array[];
  VR: Float64Array[];
  ML: Float64Array[];
  MR: Float64Array[];
  R: Float64Array[]; // vertical reaction per support
  total: number[];
}

export function buildMaskSums(parts: LoadSetResult[], totals: number[], nNodes: number, nSupports: number): MaskSums {
  const nMasks = 1 << parts.length;
  const out: MaskSums = { defl: [], VL: [], VR: [], ML: [], MR: [], R: [], total: [] };
  for (let m = 0; m < nMasks; m++) {
    if (m === 0) {
      out.defl.push(new Float64Array(nNodes));
      out.VL.push(new Float64Array(nNodes));
      out.VR.push(new Float64Array(nNodes));
      out.ML.push(new Float64Array(nNodes));
      out.MR.push(new Float64Array(nNodes));
      out.R.push(new Float64Array(nSupports));
      out.total.push(0);
      continue;
    }
    // m = (m without its lowest bit) + lowest segment
    const low = m & -m;
    const seg = Math.log2(low);
    const prev = m ^ low;
    const p = parts[seg]!;
    const add = (base: Float64Array, extra: ArrayLike<number>) => {
      const r = new Float64Array(base.length);
      for (let i = 0; i < base.length; i++) r[i] = base[i]! + extra[i]!;
      return r;
    };
    out.defl.push(add(out.defl[prev]!, p.defl));
    out.VL.push(add(out.VL[prev]!, p.VL));
    out.VR.push(add(out.VR[prev]!, p.VR));
    out.ML.push(add(out.ML[prev]!, p.ML));
    out.MR.push(add(out.MR[prev]!, p.MR));
    out.R.push(add(out.R[prev]!, p.reactions.map((r) => r.V)));
    out.total.push(out.total[prev]! + totals[seg]!);
  }
  return out;
}

/** Masks to run for a pattern: every on/off arrangement when loads exist, else none loaded. */
export function masksFor(has: boolean, factor: number, nSegments: number): number[] {
  if (!has || factor === 0) return [0];
  const all: number[] = [];
  for (let m = 0; m < 1 << nSegments; m++) all.push(m);
  return all;
}
