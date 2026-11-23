// Engine types. The engine is pure: no React, no DOM, no file access.
// Units at the engine boundary: kN, m, kN/m, kN·m, mm for section sizes, MPa for strengths.

export type Pattern = 'D' | 'L' | 'S';
export const PATTERNS: readonly Pattern[] = ['D', 'L', 'S'];

/** One code value as the engine sees it. `key` is the dotted path in code-values.json. */
export interface CodeValue<T> {
  key: string;
  value: T;
  units: string;
  ref: string; // document + clause, e.g. "CSA O86 6.5.4.1"
  verified: boolean;
}

export interface Factors {
  D: number;
  L: number;
  S: number;
}

export interface Combination extends Factors {
  name: string;
}

export interface Strengths {
  fb: number;
  fv: number;
  fc: number;
  fcp: number;
  E: number;
  E05: number;
}

export interface ServiceFactors {
  fb: number;
  fv: number;
  fc: number;
  fcp: number;
  E: number;
}

/** Every code value the engine needs, passed in by the caller. Nothing is hard-coded. */
export interface CodeValues {
  woodDensity: CodeValue<number>;
  IsULS: CodeValue<number>;
  IsSLS: CodeValue<number>;
  combinations: CodeValue<Combination[]>;
  slsCombinations: CodeValue<{ liveSnow: Factors; total: Factors }>;
  kdStandard: CodeValue<number>;
  kdPermanent: CodeValue<number>;
  kdDeadDominant: CodeValue<{ a: number; b: number; min: number }>;
  phiBending: CodeValue<number>;
  phiShear: CodeValue<number>;
  phiCompression: CodeValue<number>;
  phiBearing: CodeValue<number>;
  plyThickness: CodeValue<number>;
  depths: CodeValue<Record<string, number>>;
  strengths: CodeValue<Record<string, Strengths>>;
  sizeFactorBendingShear: CodeValue<Record<string, number>>;
  systemFactorBuiltUp: CodeValue<number>;
  columnSizeFactor: CodeValue<{ coefficient: number; exponent: number; max: number }>;
  columnStabilityConstant: CodeValue<number>;
  columnSlendernessMax: CodeValue<number>;
  builtUpColumnFactor: CodeValue<number>;
  KB: CodeValue<number>;
  KZcp: CodeValue<number>;
  KS: CodeValue<ServiceFactors>;
  KT: CodeValue<number>;
  deflectionLiveSnow: CodeValue<number>; // span divisor, e.g. 360
  deflectionTotal: CodeValue<number>; // span divisor, e.g. 240
  snowCb: CodeValue<number>;
  snowCw: CodeValue<number>;
  snowCa: CodeValue<number>;
  snowCsRule: CodeValue<{ flatUpToDeg: number; zeroAtDeg: number }>;
}

// ---------- Member input ----------

export type SupportType = 'pin' | 'roller' | 'fixed';
export type Status = 'verified' | 'assumed';

export interface Support {
  id: string;
  x: number; // m from member start
  type: SupportType;
  /** Bearing length along the member, mm. Null means unknown: the project default is used and marked assumed. */
  bearingLength: number | null;
}

interface LoadBase {
  id: string;
  pattern: Pattern;
  label: string;
}

/** Linearly varying line load from x1 to x2. Covers uniform, partial, triangular and trapezoidal. kN/m, downward positive. */
export interface LineLoad extends LoadBase {
  shape: 'line';
  x1: number;
  x2: number;
  w1: number;
  w2: number;
}

/** Point force, kN, downward positive. */
export interface PointLoad extends LoadBase {
  shape: 'point';
  x: number;
  P: number;
}

/** Point moment, kN·m. Positive = counter-clockwise, with x to the right and y up. */
export interface MomentLoad extends LoadBase {
  shape: 'moment';
  x: number;
  M: number;
}

export type MemberLoad = LineLoad | PointLoad | MomentLoad;

export interface SawnSection {
  species: string;
  size: string; // e.g. "2x10"
  plies: number; // 1 to 4
}

export interface MemberOverrides {
  KS?: Partial<ServiceFactors>;
  KT?: number;
}

export interface ProjectSettings {
  cantileverDeflectionMultiplier: number;
  defaultBearingLength: number; // mm
  maxSpans: number;
}

export interface MemberInput {
  length: number; // m
  supports: Support[];
  section: SawnSection;
  compressionEdgeBraced: boolean;
  wetOrExterior: boolean;
  includeSelfWeight: boolean;
  /** Snow loads are entered before the importance factor Is. The engine applies Is (ULS or SLS). */
  loads: MemberLoad[];
  overrides?: MemberOverrides;
  settings: ProjectSettings;
}
