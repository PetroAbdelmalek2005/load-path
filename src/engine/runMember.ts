// Run one member: solve every load pattern, build every combination and pattern case,
// and check bending, shear, bearing and deflection to CSA O86 (values from code-values.json).
import type { CodeValues, Combination, Factors, MemberInput, MemberLoad, ServiceFactors } from './types';
import { Uses, type Traced, type TraceInput } from './trace';
import { sectionProps, type SectionProps } from './sections';
import { discontinuities } from './loads';
import { buildMesh, type Segment } from './solver/beam';
import { UnstableError } from './solver/banded';
import { buildMaskSums, maskSpans, masksFor, solveUnitCases } from './patterns';
import { checkEquilibrium, type EquilibriumResult } from './equilibrium';
import { governingKD, kdFrom, type GoverningKD } from './checks/loadDuration';

export type CheckStatus = 'pass' | 'fail' | 'refused' | 'not-applicable';

export interface CaseRef {
  combination: string;
  /** Loaded span segments, numbered from 1. */
  liveSpans: number[];
  snowSpans: number[];
}

export interface CheckResult {
  id: string;
  label: string;
  clause: string;
  status: CheckStatus;
  ratio: number | null;
  demand?: Traced;
  resistance?: Traced;
  governing?: CaseRef & { x?: number; supportId?: string; segment?: number };
  kd?: GoverningKD;
  extra?: Traced[];
  unverified: string[];
  message?: string;
}

export interface ReactionSummary {
  supportId: string;
  x: number;
  type: string;
  /** Unfactored, all spans loaded. Snow includes Is (ULS). kN, upward positive. */
  D: number;
  L: number;
  S: number;
  /** Unfactored reaction moments for fixed supports, kN·m, counter-clockwise positive. */
  MD: number;
  ML: number;
  MS: number;
  factoredMax: { value: number; at: CaseRef };
  factoredMin: { value: number; at: CaseRef };
  bearingLength: number;
  bearingLengthStatus: 'verified' | 'assumed';
}

export interface UpliftFlag {
  supportId: string;
  x: number;
  force: number; // kN, positive number = uplift magnitude
  at: CaseRef;
}

export interface Diagrams {
  /** Stations: every node twice (just left, just right), so jumps show. */
  x: number[];
  envelope: { Vmax: number[]; Vmin: number[]; Mmax: number[]; Mmin: number[] };
  /** Each ULS combination with all spans loaded. */
  combinations: { name: string; V: number[]; M: number[] }[];
  /** Node positions for deflection. */
  xNodes: number[];
  deflection: { name: string; max: number[]; min: number[]; allLoaded: number[] }[];
}

export interface MemberResult {
  section: SectionProps & { KH: number; EI: number; KS: ServiceFactors; KT: number };
  segments: Segment[];
  checks: {
    bending: CheckResult;
    shear: CheckResult;
    bearing: CheckResult[];
    deflectionLiveSnow: CheckResult[];
    deflectionTotal: CheckResult[];
  };
  reactions: ReactionSummary[];
  uplift: UpliftFlag[];
  /** Largest factored sagging and hogging moment over all combinations and patterns. */
  momentExtremes: {
    positive: { value: number; x: number; at: CaseRef } | null;
    negative: { value: number; x: number; at: CaseRef } | null;
  };
  equilibrium: EquilibriumResult[];
  diagrams: Diagrams;
  warnings: string[];
  assumed: string[];
  unverified: string[];
  caseCount: number;
}

export class MemberInputError extends Error {}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function runMember(input: MemberInput, cv: CodeValues): MemberResult {
  validate(input);
  const warnings: string[] = [];
  const assumed: string[] = [];
  const common = new Uses();
  const sec = sectionProps(input.section, cv, common);

  // Service and treatment factors: code values unless overridden on this member.
  const ksCode = new Uses();
  const KS: ServiceFactors = { ...ksCode.cv(cv.KS), ...(input.overrides?.KS ?? {}) };
  const ktOverridden = input.overrides?.KT !== undefined;
  const KT = ktOverridden ? input.overrides!.KT! : ksCode.cv(cv.KT);
  const ksOverridden = input.overrides?.KS !== undefined && Object.keys(input.overrides.KS).length > 0;
  if (input.wetOrExterior && !ksOverridden) {
    warnings.push(
      'This member is marked wet or exterior, but it uses dry-service factors (KS = 1.0). Enter wet-service KS values for this member.',
    );
  }

  const KH = sec.plies > 1 ? common.cv(cv.systemFactorBuiltUp) : 1.0;
  const EI = sec.strengths.E * KS.E * KT * sec.I * 1e-9; // kN·m²

  // Loads, plus self-weight as a dead line load.
  const loads: MemberLoad[] = [...input.loads];
  if (input.includeSelfWeight) {
    common.cv(cv.woodDensity);
    loads.push({ id: 'self-weight', pattern: 'D', label: 'Self-weight', shape: 'line', x1: 0, x2: input.length, w1: sec.selfWeight, w2: sec.selfWeight });
  }
  const hasSnow = loads.some((l) => l.pattern === 'S');
  const IsU = hasSnow ? common.cv(cv.IsULS) : cv.IsULS.value;
  const IsS = cv.IsSLS.value;
  const combos: Combination[] = common.cv(cv.combinations);
  common.cv(cv.kdStandard);
  common.cv(cv.kdPermanent);
  common.cv(cv.kdDeadDominant);

  let mesh;
  try {
    mesh = buildMesh(input.length, input.supports, discontinuities(loads), EI);
  } catch (e) {
    if (e instanceof UnstableError) throw new MemberInputError(e.message);
    throw new MemberInputError((e as Error).message);
  }
  const nSeg = mesh.segments.length;
  if (nSeg > input.settings.maxSpans) {
    throw new MemberInputError(
      `This member has ${nSeg} span segments. Pattern loading runs every on/off case only up to ${input.settings.maxSpans}. Split the member or ask for a larger limit.`,
    );
  }
  const uc = solveUnitCases(mesh, loads);
  const nn = mesh.xs.length;
  const nSup = input.supports.length;
  const sumL = buildMaskSums(uc.L, uc.totals.L, nn, nSup);
  const sumS = buildMaskSums(uc.S, uc.totals.S, nn, nSup);
  const allMask = (1 << nSeg) - 1;

  const equilibrium = [
    checkEquilibrium('D', [uc.D], input.length),
    checkEquilibrium('L', uc.L, input.length),
    checkEquilibrium('S', uc.S, input.length),
  ];
  for (const e of equilibrium) {
    if (!e.ok) warnings.push(`Equilibrium check failed for ${e.pattern} loads: applied ${e.appliedForce.toFixed(3)} kN, reactions ${e.reactionForce.toFixed(3)} kN. Do not use these results.`);
  }

  // ---------- Resistances at KD = 1 ----------
  const phiB = cv.phiBending.value;
  const phiV = cv.phiShear.value;
  const phiCp = cv.phiBearing.value;
  const KL = input.compressionEdgeBraced ? 1.0 : null;
  const Mr1 = KL === null ? 0 : (phiB * sec.strengths.fb * KH * KS.fb * KT * sec.S * sec.KZ * KL) / 1e6; // kN·m
  const Vr1 = (phiV * sec.strengths.fv * KH * KS.fv * KT * ((2 * sec.A) / 3) * sec.KZ) / 1000; // kN
  const KB = cv.KB.value;
  const KZcp = cv.KZcp.value;
  const bearingLen = input.supports.map((s) => {
    if (s.bearingLength !== null && s.bearingLength > 0) return { lb: s.bearingLength, status: 'verified' as const };
    assumed.push(`Bearing length at support "${s.id}" = ${input.settings.defaultBearingLength} mm (project default; supporting element size unknown).`);
    return { lb: input.settings.defaultBearingLength, status: 'assumed' as const };
  });
  const Qr1 = bearingLen.map((b) => (phiCp * sec.strengths.fcp * KS.fcp * KT * sec.b * b.lb * KB * KZcp) / 1000); // kN

  // ---------- KD (fast inline version of kdFrom) ----------
  const kdP = cv.kdPermanent.value;
  const kdStd = cv.kdStandard.value;
  const kdDD = cv.kdDeadDominant.value;
  const kdFast = (PL: number, PS: number, deadOnly: boolean): number => {
    const pl = Math.abs(PL);
    const ps = Math.abs(PS);
    if (deadOnly || ps <= 1e-12) return kdP;
    if (pl > ps) return Math.min(kdStd, Math.max(kdDD.min, kdDD.a - kdDD.b * Math.log10(pl / ps)));
    return kdStd;
  };

  // ---------- Envelopes and governing cases ----------
  const ns = nn * 2; // stations: node left, node right
  const env = {
    Vmax: new Array<number>(ns).fill(-Infinity),
    Vmin: new Array<number>(ns).fill(Infinity),
    Mmax: new Array<number>(ns).fill(-Infinity),
    Mmin: new Array<number>(ns).fill(Infinity),
  };
  type Best = { r: number; c: Combination; mL: number; mS: number; st: number; f: number; kd: number } | null;
  let bestM: Best = null;
  let bestPos: Best = null;
  let bestNeg: Best = null;
  let bestV: Best = null;
  const bestBearing: Best[] = input.supports.map(() => null);
  const reacMax = input.supports.map(() => ({ v: -Infinity, c: combos[0]!, mL: 0, mS: 0 }));
  const reacMin = input.supports.map(() => ({ v: Infinity, c: combos[0]!, mL: 0, mS: 0 }));
  let caseCount = 0;

  const D = uc.D;
  for (const c of combos) {
    const deadOnly = c.L === 0 && c.S === 0;
    const fS = c.S * IsU;
    for (const mL of masksFor(uc.has.L, c.L, nSeg)) {
      for (const mS of masksFor(uc.has.S, c.S, nSeg)) {
        caseCount++;
        const PStot = (c.L !== 0 ? sumL.total[mL]! : 0) + (c.S !== 0 ? IsU * sumS.total[mS]! : 0);
        const kdTot = kdFast(uc.totals.D, PStot, deadOnly);
        const sides: [Float64Array, Float64Array, Float64Array, Float64Array, Float64Array, Float64Array, number][] = [
          [D.ML, sumL.ML[mL]!, sumS.ML[mS]!, D.VL, sumL.VL[mL]!, sumS.VL[mS]!, 0],
          [D.MR, sumL.MR[mL]!, sumS.MR[mS]!, D.VR, sumL.VR[mL]!, sumS.VR[mS]!, 1],
        ];
        for (const [mD, mLa, mSa, vD, vLa, vSa, side] of sides) {
          for (let i = 0; i < nn; i++) {
            const st = 2 * i + side;
            const md = mD[i]!;
            const ml = mLa[i]!;
            const ms = mSa[i]!;
            const Mf = c.D * md + c.L * ml + fS * ms;
            if (Mf > env.Mmax[st]!) env.Mmax[st] = Mf;
            if (Mf < env.Mmin[st]!) env.Mmin[st] = Mf;
            if (Mf > 1e-9 && (!bestPos || Mf > bestPos.f)) bestPos = { r: 0, c, mL, mS, st, f: Mf, kd: 0 };
            if (Mf < -1e-9 && (!bestNeg || Mf < bestNeg.f)) bestNeg = { r: 0, c, mL, mS, st, f: Mf, kd: 0 };
            if (Mr1 > 0) {
              const kd = Math.min(kdFast(md, (c.L !== 0 ? ml : 0) + (c.S !== 0 ? IsU * ms : 0), deadOnly), kdTot);
              const r = Math.abs(Mf) / (Mr1 * kd);
              if (!bestM || r > bestM.r) bestM = { r, c, mL, mS, st, f: Mf, kd };
            }
            const vd = vD[i]!;
            const vl = vLa[i]!;
            const vs = vSa[i]!;
            const Vf = c.D * vd + c.L * vl + fS * vs;
            if (Vf > env.Vmax[st]!) env.Vmax[st] = Vf;
            if (Vf < env.Vmin[st]!) env.Vmin[st] = Vf;
            const kdv = Math.min(kdFast(vd, (c.L !== 0 ? vl : 0) + (c.S !== 0 ? IsU * vs : 0), deadOnly), kdTot);
            const rv = Math.abs(Vf) / (Vr1 * kdv);
            if (!bestV || rv > bestV.r) bestV = { r: rv, c, mL, mS, st, f: Vf, kd: kdv };
          }
        }
        for (let j = 0; j < nSup; j++) {
          const rd = D.reactions[j]!.V;
          const rl = sumL.R[mL]![j]!;
          const rs = sumS.R[mS]![j]!;
          const Rf = c.D * rd + c.L * rl + fS * rs;
          if (Rf > reacMax[j]!.v) reacMax[j] = { v: Rf, c, mL, mS };
          if (Rf < reacMin[j]!.v) reacMin[j] = { v: Rf, c, mL, mS };
          if (Rf > 0) {
            const kd = Math.min(kdFast(rd, (c.L !== 0 ? rl : 0) + (c.S !== 0 ? IsU * rs : 0), deadOnly), kdTot);
            const r = Rf / (Qr1[j]! * kd);
            const b = bestBearing[j];
            if (!b || r > b.r) bestBearing[j] = { r, c, mL, mS, st: j, f: Rf, kd };
          }
        }
      }
    }
  }

  const caseRef = (c: Combination, mL: number, mS: number): CaseRef => ({
    combination: c.name,
    liveSpans: c.L !== 0 && uc.has.L ? maskSpans(mL, nSeg).map((i) => i + 1) : [],
    snowSpans: c.S !== 0 && uc.has.S ? maskSpans(mS, nSeg).map((i) => i + 1) : [],
  });
  const stationX = (st: number) => mesh.xs[st >> 1]!;

  /** Re-derive KD for a governing case with full trace. */
  const tracedKD = (b: NonNullable<Best>, eff: { d: number; l: number; s: number }, u: Uses): GoverningKD => {
    const deadOnly = b.c.L === 0 && b.c.S === 0;
    const PS = (b.c.L !== 0 ? eff.l : 0) + (b.c.S !== 0 ? IsU * eff.s : 0);
    const PStot = (b.c.L !== 0 ? sumL.total[b.mL]! : 0) + (b.c.S !== 0 ? IsU * sumS.total[b.mS]! : 0);
    return governingKD(kdFrom(eff.d, PS, deadOnly, cv, u), kdFrom(uc.totals.D, PStot, deadOnly, cv, u));
  };

  const ksInput = (u: Uses, sym: string, prop: keyof ServiceFactors): TraceInput =>
    input.overrides?.KS?.[prop] !== undefined
      ? { symbol: sym, value: KS[prop], units: '-', codeKey: 'member override' }
      : { symbol: sym, value: u.cv(cv.KS)[prop], units: '-', codeKey: cv.KS.key, verified: cv.KS.verified };
  const ktInput = (u: Uses): TraceInput =>
    ktOverridden
      ? { symbol: 'KT', value: KT, units: '-', codeKey: 'member override' }
      : { symbol: 'KT', value: u.cv(cv.KT), units: '-', codeKey: cv.KT.key, verified: cv.KT.verified };
  const khInput = (u: Uses): TraceInput =>
    sec.plies > 1 ? u.input('KH', cv.systemFactorBuiltUp) : { symbol: 'KH', value: 1.0, units: '-', codeKey: 'single member, no system factor' };
  const demandInputs = (sym: string, c: Combination, eff: { d: number; l: number; s: number }, units: string): TraceInput[] => [
    { symbol: 'αD', value: c.D, units: '-', codeKey: cv.combinations.key, verified: cv.combinations.verified },
    { symbol: 'αL', value: c.L, units: '-', codeKey: cv.combinations.key, verified: cv.combinations.verified },
    { symbol: 'αS', value: c.S, units: '-', codeKey: cv.combinations.key, verified: cv.combinations.verified },
    { symbol: 'Is', value: IsU, units: '-', codeKey: cv.IsULS.key, verified: cv.IsULS.verified },
    { symbol: `${sym}D`, value: r3(eff.d), units },
    { symbol: `${sym}L`, value: r3(eff.l), units },
    { symbol: `${sym}S`, value: r3(eff.s), units },
  ];

  // ---------- Bending ----------
  let bending: CheckResult;
  {
    const u = new Uses().merge(common);
    if (KL === null) {
      bending = {
        id: 'bending',
        label: 'Bending',
        clause: `${cv.phiBending.ref}; KL: CSA O86 6.5.4.2`,
        status: 'refused',
        ratio: null,
        unverified: [],
        message:
          'The compression edge is not marked as braced. Unbraced lateral stability (KL) is not built until CSA O86 6.5.4.2 is verified. Brace the compression edge or check by hand.',
      };
      warnings.push('Bending check refused: compression edge not braced.');
    } else {
      const b = bestM!;
      const i = b.st >> 1;
      const left = (b.st & 1) === 0;
      const eff = {
        d: (left ? D.ML : D.MR)[i]!,
        l: (left ? sumL.ML : sumL.MR)[b.mL]![i]!,
        s: (left ? sumS.ML : sumS.MR)[b.mS]![i]!,
      };
      const kd = tracedKD(b, eff, u);
      const fb = sec.strengths.fb;
      const Fb = fb * kd.KD * KH * KS.fb * KT;
      const Mr = (u.cv(cv.phiBending) * Fb * sec.S * sec.KZ * KL) / 1e6;
      const inputs: TraceInput[] = [
        u.input('φ', cv.phiBending),
        { symbol: 'fb', value: fb, units: 'MPa', codeKey: cv.strengths.key, verified: cv.strengths.verified },
        { symbol: 'KD', value: r3(kd.KD), units: '-', codeKey: 'see KD details' },
        khInput(u),
        ksInput(u, 'KSb', 'fb'),
        ktInput(u),
        { symbol: 'S', value: Math.round(sec.S), units: 'mm³' },
        { symbol: 'KZb', value: sec.KZ, units: '-', codeKey: cv.sizeFactorBendingShear.key, verified: cv.sizeFactorBendingShear.verified },
        { symbol: 'KL', value: 1.0, units: '-', codeKey: 'compression edge braced (engineer input)' },
      ];
      const ratio = Math.abs(b.f) / Mr;
      bending = {
        id: 'bending',
        label: 'Bending',
        clause: cv.phiBending.ref,
        status: ratio <= 1 + 1e-9 ? 'pass' : 'fail',
        ratio,
        demand: {
          label: 'Factored moment Mf',
          formula: 'Mf = αD·MD + αL·ML + αS·Is·MS',
          inputs: demandInputs('M', b.c, eff, 'kN·m'),
          value: b.f,
          units: 'kN·m',
          clause: cv.combinations.ref,
          unverified: u.list(),
        },
        resistance: {
          label: 'Moment resistance Mr',
          formula: 'Mr = φ·Fb·S·KZb·KL, with Fb = fb·(KD·KH·KSb·KT)',
          inputs,
          value: Mr,
          units: 'kN·m',
          clause: cv.phiBending.ref,
          unverified: u.list(),
        },
        governing: { ...caseRef(b.c, b.mL, b.mS), x: stationX(b.st) },
        kd,
        unverified: u.list(),
      };
      if (Math.min(...env.Mmin) < -1e-6 && Math.max(...env.Mmax) > 1e-6) {
        warnings.push(
          'This member has both sagging and hogging moment. KL = 1.0 assumes every compression edge is braced, including the bottom edge where moment is hogging. Confirm bracing there.',
        );
      } else if (Math.min(...env.Mmin) < -1e-6) {
        warnings.push('This member has hogging moment, so the bottom edge is in compression. KL = 1.0 assumes that edge is braced. Confirm it.');
      }
    }
  }

  // ---------- Shear ----------
  let shear: CheckResult;
  {
    const u = new Uses().merge(common);
    const b = bestV!;
    const i = b.st >> 1;
    const left = (b.st & 1) === 0;
    const eff = {
      d: (left ? D.VL : D.VR)[i]!,
      l: (left ? sumL.VL : sumL.VR)[b.mL]![i]!,
      s: (left ? sumS.VL : sumS.VR)[b.mS]![i]!,
    };
    const kd = tracedKD(b, eff, u);
    const fv = sec.strengths.fv;
    const Fv = fv * kd.KD * KH * KS.fv * KT;
    const Vr = (u.cv(cv.phiShear) * Fv * ((2 * sec.A) / 3) * sec.KZ) / 1000;
    const ratio = Math.abs(b.f) / Vr;
    shear = {
      id: 'shear',
      label: 'Shear',
      clause: cv.phiShear.ref,
      status: ratio <= 1 + 1e-9 ? 'pass' : 'fail',
      ratio,
      demand: {
        label: 'Factored shear Vf',
        formula: 'Vf = αD·VD + αL·VL + αS·Is·VS (checked at the support face, not at distance d)',
        inputs: demandInputs('V', b.c, eff, 'kN'),
        value: b.f,
        units: 'kN',
        clause: cv.combinations.ref,
        unverified: u.list(),
      },
      resistance: {
        label: 'Shear resistance Vr',
        formula: 'Vr = φ·Fv·(2An/3)·KZv, with Fv = fv·(KD·KH·KSv·KT)',
        inputs: [
          u.input('φ', cv.phiShear),
          { symbol: 'fv', value: fv, units: 'MPa', codeKey: cv.strengths.key, verified: cv.strengths.verified },
          { symbol: 'KD', value: r3(kd.KD), units: '-', codeKey: 'see KD details' },
          khInput(u),
          ksInput(u, 'KSv', 'fv'),
          ktInput(u),
          { symbol: 'An', value: sec.A, units: 'mm²' },
          { symbol: 'KZv', value: sec.KZ, units: '-', codeKey: cv.sizeFactorBendingShear.key, verified: cv.sizeFactorBendingShear.verified },
        ],
        value: Vr,
        units: 'kN',
        clause: cv.phiShear.ref,
        unverified: u.list(),
      },
      governing: { ...caseRef(b.c, b.mL, b.mS), x: stationX(b.st) },
      kd,
      unverified: u.list(),
    };
  }

  // ---------- Bearing (per support) ----------
  const bearing: CheckResult[] = input.supports.map((s, j) => {
    const u = new Uses().merge(common);
    u.cv(cv.phiBearing);
    u.cv(cv.KB);
    u.cv(cv.KZcp);
    const b = bestBearing[j];
    const lb = bearingLen[j]!;
    if (!b) {
      return {
        id: `bearing-${s.id}`,
        label: `Bearing at ${s.id}`,
        clause: cv.phiBearing.ref,
        status: 'not-applicable' as const,
        ratio: null,
        unverified: u.list(),
        message: 'No downward reaction in any case.',
      };
    }
    const eff = { d: D.reactions[j]!.V, l: sumL.R[b.mL]![j]!, s: sumS.R[b.mS]![j]! };
    const kd = tracedKD(b, eff, u);
    const Fcp = sec.strengths.fcp * kd.KD * KS.fcp * KT;
    const Qr = (phiCp * Fcp * sec.b * lb.lb * KB * KZcp) / 1000;
    const lbReq = (b.f * 1000) / (phiCp * Fcp * sec.b * KB * KZcp);
    const ratio = b.f / Qr;
    return {
      id: `bearing-${s.id}`,
      label: `Bearing at ${s.id} (x = ${s.x} m)`,
      clause: cv.phiBearing.ref,
      status: ratio <= 1 + 1e-9 ? ('pass' as const) : ('fail' as const),
      ratio,
      demand: {
        label: 'Factored reaction Qf',
        formula: 'Qf = αD·RD + αL·RL + αS·Is·RS',
        inputs: demandInputs('R', b.c, eff, 'kN'),
        value: b.f,
        units: 'kN',
        clause: cv.combinations.ref,
        unverified: u.list(),
      },
      resistance: {
        label: 'Bearing resistance Qr',
        formula: 'Qr = φ·Fcp·Ab·KB·KZcp, with Fcp = fcp·(KD·KScp·KT), Ab = b·lb',
        inputs: [
          u.input('φ', cv.phiBearing),
          { symbol: 'fcp', value: sec.strengths.fcp, units: 'MPa', codeKey: cv.strengths.key, verified: cv.strengths.verified },
          { symbol: 'KD', value: r3(kd.KD), units: '-', codeKey: 'see KD details' },
          ksInput(u, 'KScp', 'fcp'),
          ktInput(u),
          { symbol: 'b', value: sec.b, units: 'mm' },
          { symbol: 'lb', value: lb.lb, units: 'mm', codeKey: lb.status === 'assumed' ? 'ASSUMED project default' : 'engineer input' },
          u.input('KB', cv.KB),
          u.input('KZcp', cv.KZcp),
        ],
        value: Qr,
        units: 'kN',
        clause: cv.phiBearing.ref,
        unverified: u.list(),
      },
      extra: [
        {
          label: 'Required bearing length',
          formula: 'lb,req = Qf / (φ·Fcp·b·KB·KZcp)',
          inputs: [],
          value: lbReq,
          units: 'mm',
          clause: cv.phiBearing.ref,
          unverified: u.list(),
        },
      ],
      governing: { ...caseRef(b.c, b.mL, b.mS), supportId: s.id },
      kd,
      unverified: u.list(),
    };
  });

  // ---------- Deflection (specified loads) ----------
  const slsU = new Uses();
  slsU.cv(cv.depths);
  slsU.cv(cv.plyThickness);
  slsU.cv(cv.strengths);
  const slsCombos = slsU.cv(cv.slsCombinations);
  if (hasSnow) slsU.cv(cv.IsSLS);
  if (!ktOverridden) slsU.cv(cv.KT);
  if (input.overrides?.KS?.E === undefined) slsU.cv(cv.KS);
  const segNodes = mesh.segments.map((sg) => {
    const idx: number[] = [];
    mesh.xs.forEach((x, i) => {
      if (x >= sg.a - 1e-7 && x <= sg.b + 1e-7) idx.push(i);
    });
    return idx;
  });
  const deflDiagrams: Diagrams['deflection'] = [];
  const deflCheck = (name: 'liveSnow' | 'total', f: Factors, divisor: number, divKey: string, divVerified: boolean): CheckResult[] => {
    const u = new Uses().merge(slsU);
    if (f.D !== 0 && input.includeSelfWeight) u.cv(cv.woodDensity);
    if (!divVerified) u.merge([divKey]);
    const worst = mesh.segments.map(() => ({ v: 0, i: 0, mL: 0, mS: 0 }));
    const dmax = new Array<number>(nn).fill(-Infinity);
    const dmin = new Array<number>(nn).fill(Infinity);
    for (const mL of masksFor(uc.has.L, f.L, nSeg)) {
      for (const mS of masksFor(uc.has.S, f.S, nSeg)) {
        const dl = sumL.defl[mL]!;
        const ds = sumS.defl[mS]!;
        for (let i = 0; i < nn; i++) {
          const v = f.D * D.defl[i]! + f.L * dl[i]! + f.S * IsS * ds[i]!;
          if (v > dmax[i]!) dmax[i] = v;
          if (v < dmin[i]!) dmin[i] = v;
        }
        mesh.segments.forEach((_, k) => {
          for (const i of segNodes[k]!) {
            const v = f.D * D.defl[i]! + f.L * dl[i]! + f.S * IsS * ds[i]!;
            if (Math.abs(v) > Math.abs(worst[k]!.v)) worst[k] = { v, i, mL, mS };
          }
        });
      }
    }
    const allLoaded = Array.from(mesh.xs, (_, i) => f.D * D.defl[i]! + f.L * sumL.defl[allMask]![i]! + f.S * IsS * sumS.defl[allMask]![i]!);
    deflDiagrams.push({ name: name === 'liveSnow' ? 'Live + snow (specified)' : 'Total D + L + S (specified)', max: dmax, min: dmin, allLoaded });
    const label = name === 'liveSnow' ? 'Deflection, live + snow' : 'Deflection, total';
    const slsName = name === 'liveSnow' ? `${f.L}L + ${f.S}S (SLS)` : `${f.D}D + ${f.L}L + ${f.S}S (SLS)`;
    return mesh.segments.map((sg, k) => {
      const w = worst[k]!;
      const Ls = sg.b - sg.a;
      const mult = sg.kind === 'cantilever' ? input.settings.cantileverDeflectionMultiplier : 1;
      const limit = (mult * Ls * 1000) / divisor;
      const ratio = Math.abs(w.v) / limit;
      const fake: Combination = { name: slsName, ...f };
      return {
        id: `deflection-${name}-${k + 1}`,
        label: `${label}, segment ${k + 1}${sg.kind === 'cantilever' ? ' (cantilever)' : ''}`,
        clause: cv.deflectionLiveSnow.ref,
        status: ratio <= 1 + 1e-9 ? ('pass' as const) : ('fail' as const),
        ratio,
        demand: {
          label: 'Maximum deflection Δ',
          formula: `Δ under ${slsName}; snow × Is(SLS); E·I with E = E·KSE·KT`,
          inputs: [
            { symbol: 'E', value: sec.strengths.E, units: 'MPa', codeKey: cv.strengths.key, verified: cv.strengths.verified },
            { symbol: 'KSE', value: KS.E, units: '-' },
            { symbol: 'KT', value: KT, units: '-' },
            { symbol: 'I', value: Math.round(sec.I), units: 'mm⁴' },
            { symbol: 'Is(SLS)', value: IsS, units: '-', codeKey: cv.IsSLS.key, verified: cv.IsSLS.verified },
          ],
          value: Math.abs(w.v),
          units: 'mm',
          clause: cv.slsCombinations.ref,
          unverified: u.list(),
        },
        resistance: {
          label: 'Deflection limit',
          formula: sg.kind === 'cantilever' ? `limit = ${mult}·Lc / ${divisor} (project criteria for cantilevers)` : `limit = L / ${divisor}`,
          inputs: [
            { symbol: sg.kind === 'cantilever' ? 'Lc' : 'L', value: r3(Ls), units: 'm' },
            { symbol: 'divisor', value: divisor, units: 'span/', codeKey: divKey, verified: divVerified },
          ],
          value: limit,
          units: 'mm',
          clause: name === 'liveSnow' ? cv.deflectionLiveSnow.ref : cv.deflectionTotal.ref,
          unverified: u.list(),
        },
        governing: { ...caseRef(fake, w.mL, w.mS), x: mesh.xs[w.i]!, segment: k + 1 },
        unverified: u.list(),
      };
    });
  };
  const deflectionLiveSnow = deflCheck('liveSnow', slsCombos.liveSnow, cv.deflectionLiveSnow.value, cv.deflectionLiveSnow.key, cv.deflectionLiveSnow.verified);
  const deflectionTotal = deflCheck('total', slsCombos.total, cv.deflectionTotal.value, cv.deflectionTotal.key, cv.deflectionTotal.verified);

  // ---------- Reactions and uplift ----------
  const reactions: ReactionSummary[] = input.supports.map((s, j) => ({
    supportId: s.id,
    x: s.x,
    type: s.type,
    D: D.reactions[j]!.V,
    L: sumL.R[allMask]![j]!,
    S: IsU * sumS.R[allMask]![j]!,
    MD: D.reactions[j]!.M,
    ML: uc.L.reduce((a, r) => a + r.reactions[j]!.M, 0),
    MS: IsU * uc.S.reduce((a, r) => a + r.reactions[j]!.M, 0),
    factoredMax: { value: reacMax[j]!.v, at: caseRef(reacMax[j]!.c, reacMax[j]!.mL, reacMax[j]!.mS) },
    factoredMin: { value: reacMin[j]!.v, at: caseRef(reacMin[j]!.c, reacMin[j]!.mL, reacMin[j]!.mS) },
    bearingLength: bearingLen[j]!.lb,
    bearingLengthStatus: bearingLen[j]!.status,
  }));
  const uplift: UpliftFlag[] = [];
  reactions.forEach((r) => {
    if (r.factoredMin.value < -1e-6) {
      uplift.push({ supportId: r.supportId, x: r.x, force: -r.factoredMin.value, at: r.factoredMin.at });
      warnings.push(`Uplift: anchorage required at support "${r.supportId}" — ${(-r.factoredMin.value).toFixed(2)} kN under ${r.factoredMin.at.combination}.`);
    }
  });

  // ---------- Diagrams ----------
  const stX: number[] = [];
  for (const x of mesh.xs) stX.push(x, x);
  const combDiagrams = combos.map((c) => {
    const V: number[] = [];
    const M: number[] = [];
    const fS = c.S * IsU;
    const Lm = sumL;
    const Sm = sumS;
    for (let i = 0; i < nn; i++) {
      V.push(c.D * D.VL[i]! + c.L * Lm.VL[allMask]![i]! + fS * Sm.VL[allMask]![i]!);
      V.push(c.D * D.VR[i]! + c.L * Lm.VR[allMask]![i]! + fS * Sm.VR[allMask]![i]!);
      M.push(c.D * D.ML[i]! + c.L * Lm.ML[allMask]![i]! + fS * Sm.ML[allMask]![i]!);
      M.push(c.D * D.MR[i]! + c.L * Lm.MR[allMask]![i]! + fS * Sm.MR[allMask]![i]!);
    }
    return { name: c.name, V, M };
  });

  const allUnverified = new Uses()
    .merge(common)
    .merge(bending.unverified)
    .merge(shear.unverified)
    .merge(bearing.flatMap((b) => b.unverified))
    .merge(deflectionLiveSnow.flatMap((d) => d.unverified))
    .merge(deflectionTotal.flatMap((d) => d.unverified))
    .merge(ksCode)
    .list();

  return {
    section: { ...sec, KH, EI, KS, KT },
    segments: mesh.segments,
    checks: { bending, shear, bearing, deflectionLiveSnow, deflectionTotal },
    reactions,
    uplift,
    momentExtremes: {
      positive: bestPos ? { value: bestPos.f, x: stationX(bestPos.st), at: caseRef(bestPos.c, bestPos.mL, bestPos.mS) } : null,
      negative: bestNeg ? { value: bestNeg.f, x: stationX(bestNeg.st), at: caseRef(bestNeg.c, bestNeg.mL, bestNeg.mS) } : null,
    },
    equilibrium,
    diagrams: {
      x: stX,
      envelope: env,
      combinations: combDiagrams,
      xNodes: [...mesh.xs],
      deflection: deflDiagrams,
    },
    warnings,
    assumed,
    unverified: allUnverified,
    caseCount,
  };
}

function validate(input: MemberInput): void {
  const bad = (msg: string) => {
    throw new MemberInputError(msg);
  };
  if (!Number.isFinite(input.length) || input.length <= 0) bad('Member length must be a number greater than zero.');
  for (const l of input.loads) {
    if (l.shape === 'line') {
      if (![l.x1, l.x2, l.w1, l.w2].every(Number.isFinite)) bad(`Load "${l.label}" has a missing number.`);
      if (l.x2 <= l.x1) bad(`Load "${l.label}": x2 must be greater than x1.`);
      if (l.x1 < -1e-9 || l.x2 > input.length + 1e-9) bad(`Load "${l.label}" extends past the member ends.`);
    } else if (l.shape === 'point') {
      if (![l.x, l.P].every(Number.isFinite)) bad(`Load "${l.label}" has a missing number.`);
      if (l.x < -1e-9 || l.x > input.length + 1e-9) bad(`Load "${l.label}" is off the member.`);
    } else {
      if (![l.x, l.M].every(Number.isFinite)) bad(`Load "${l.label}" has a missing number.`);
      if (l.x < -1e-9 || l.x > input.length + 1e-9) bad(`Load "${l.label}" is off the member.`);
    }
  }
  for (const s of input.supports) {
    if (!Number.isFinite(s.x)) bad(`Support "${s.id}" has no position.`);
    if (s.bearingLength !== null && !(s.bearingLength > 0)) bad(`Support "${s.id}": bearing length must be greater than zero.`);
  }
}
