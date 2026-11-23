// Post (column) check, CSA O86 6.5.6 (unverified). Axial load only; pinned both ends by default.
import type { CodeValues, Combination, SawnSection, ServiceFactors } from '../types';
import { Uses, type Traced } from '../trace';
import { kdFrom, type KDResult } from './loadDuration';

export interface AxisResult {
  axis: 'thin' | 'wide';
  d: number; // mm, dimension in the buckling direction
  Cc: number;
  KZc: number;
  KC: number;
  Pr: number; // kN, solid section
}

export interface ColumnResistance {
  Fc: number;
  thin: AxisResult;
  wide: AxisResult;
  governing: AxisResult;
  slendernessOK: boolean;
}

/** Pr for a solid rectangular section b × d (mm), Le (mm), with Fc already including KD, KH, KSc, KT. */
export function columnResistance(
  b: number,
  d: number,
  Le: number,
  Fc: number,
  E05: number,
  KSE: number,
  KT: number,
  cv: CodeValues,
  uses: Uses,
): ColumnResistance {
  const phi = uses.cv(cv.phiCompression);
  const kz = uses.cv(cv.columnSizeFactor);
  const C = uses.cv(cv.columnStabilityConstant);
  const CcMax = uses.cv(cv.columnSlendernessMax);
  const A = b * d;
  const axis = (dim: number, name: 'thin' | 'wide'): AxisResult => {
    const Cc = Le / dim;
    const KZc = Math.min(kz.max, kz.coefficient * Math.pow(dim * Le, kz.exponent));
    const KC = 1 / (1 + (Fc * KZc * Cc ** 3) / (C * E05 * KSE * KT));
    return { axis: name, d: dim, Cc, KZc, KC, Pr: (phi * Fc * A * KZc * KC) / 1000 };
  };
  const thin = axis(Math.min(b, d), 'thin');
  const wide = axis(Math.max(b, d), 'wide');
  const governing = thin.Pr <= wide.Pr ? thin : wide;
  return { Fc, thin, wide, governing, slendernessOK: Math.max(thin.Cc, wide.Cc) <= CcMax };
}

export interface PostInput {
  section: SawnSection;
  height: number; // m
  Ke: number;
  /** Specified axial loads from above, kN. Snow before Is. */
  loads: { D: number; L: number; S: number };
  includeSelfWeight: boolean;
  wetOrExterior: boolean;
  KS?: Partial<ServiceFactors>;
  KT?: number;
}

export interface PostCaseResult {
  combination: Combination;
  Pf: number;
  kd: KDResult;
  resistance: ColumnResistance;
  PrSolid: number;
  Pr: number; // after built-up factor
  ratio: number;
}

export interface PostResult {
  b: number;
  d: number;
  Le: number;
  selfWeight: number; // kN at the base
  builtUpFactor: number;
  cases: PostCaseResult[];
  governing: PostCaseResult;
  status: 'pass' | 'fail';
  slendernessOK: boolean;
  resistance: Traced;
  warnings: string[];
  unverified: string[];
}

export function checkPost(p: PostInput, cv: CodeValues): PostResult {
  const uses = new Uses();
  const warnings: string[] = [];
  const depth = uses.cv(cv.depths)[p.section.size];
  if (depth === undefined) throw new Error(`Unknown lumber size "${p.section.size}".`);
  if (!Number.isInteger(p.section.plies) || p.section.plies < 1 || p.section.plies > 4) throw new Error('Plies must be 1 to 4.');
  if (!(p.height > 0)) throw new Error('Post height must be greater than zero.');
  const sp = uses.cv(cv.strengths)[p.section.species];
  if (!sp) throw new Error(`Unknown species "${p.section.species}".`);
  const b = p.section.plies * uses.cv(cv.plyThickness);
  const d = depth;
  const Le = p.height * 1000 * p.Ke;
  const KS = { ...uses.cv(cv.KS), ...(p.KS ?? {}) };
  const KT = p.KT ?? uses.cv(cv.KT);
  if (p.wetOrExterior && !p.KS) warnings.push('Marked wet or exterior, but dry-service KS = 1.0 is used. Enter wet-service KS values.');
  const selfWeight = p.includeSelfWeight ? b * d * 1e-6 * p.height * uses.cv(cv.woodDensity) : 0;
  const builtUpFactor = p.section.plies > 1 ? uses.cv(cv.builtUpColumnFactor) : 1.0;
  const hasS = p.loads.S !== 0;
  const IsU = hasS ? uses.cv(cv.IsULS) : cv.IsULS.value;
  const D = p.loads.D + selfWeight;

  const cases = uses.cv(cv.combinations).map((c): PostCaseResult => {
    const deadOnly = c.L === 0 && c.S === 0;
    const PS = (c.L !== 0 ? p.loads.L : 0) + (c.S !== 0 ? IsU * p.loads.S : 0);
    const kd = kdFrom(D, PS, deadOnly, cv, uses); // axial: load effect = total load
    const Fc = sp.fc * kd.KD * 1.0 * KS.fc * KT; // KH = 1.0 for posts
    const res = columnResistance(b, d, Le, Fc, sp.E05, KS.E, KT, cv, uses);
    const Pf = c.D * D + c.L * p.loads.L + c.S * IsU * p.loads.S;
    const Pr = res.governing.Pr * builtUpFactor;
    return { combination: c, Pf, kd, resistance: res, PrSolid: res.governing.Pr, Pr, ratio: Pf / Pr };
  });
  const governing = cases.reduce((g, c) => (c.ratio > g.ratio ? c : g));
  const slendernessOK = governing.resistance.slendernessOK;
  if (!slendernessOK) warnings.push(`Slenderness ratio Cc exceeds ${cv.columnSlendernessMax.value}. This post is not permitted.`);
  const g = governing.resistance.governing;
  return {
    b,
    d,
    Le,
    selfWeight,
    builtUpFactor,
    cases,
    governing,
    status: slendernessOK && governing.ratio <= 1 + 1e-9 ? 'pass' : 'fail',
    slendernessOK,
    resistance: {
      label: 'Compressive resistance Pr',
      formula: 'Pr = φ·Fc·A·KZc·KC × (built-up factor); KC = [1 + Fc·KZc·Cc³/(35·E05·KSE·KT)]⁻¹; KZc = 6.3(d·L)^-0.13 ≤ 1.3',
      inputs: [
        { symbol: 'Fc', value: Math.round(governing.resistance.Fc * 1000) / 1000, units: 'MPa' },
        { symbol: 'A', value: b * d, units: 'mm²' },
        { symbol: 'Le', value: Le, units: 'mm' },
        { symbol: 'axis', value: g.axis, units: '' },
        { symbol: 'Cc', value: Math.round(g.Cc * 100) / 100, units: '-' },
        { symbol: 'KZc', value: Math.round(g.KZc * 1000) / 1000, units: '-' },
        { symbol: 'KC', value: Math.round(g.KC * 10000) / 10000, units: '-' },
        { symbol: 'built-up factor', value: builtUpFactor, units: '-', codeKey: cv.builtUpColumnFactor.key, verified: cv.builtUpColumnFactor.verified },
      ],
      value: governing.Pr,
      units: 'kN',
      clause: cv.phiCompression.ref,
      unverified: uses.list(),
    },
    warnings,
    unverified: uses.list(),
  };
}
