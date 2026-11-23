// Form state for the single-member test page, and its conversion to engine input.
import type { MemberInput, MemberLoad, Pattern, ProjectSettings, SupportType } from '../engine/types';

export type LoadShapeForm = 'area' | 'line' | 'point' | 'moment';

export interface LoadRow {
  id: string;
  pattern: Pattern;
  shape: LoadShapeForm;
  label: string;
  status: 'verified' | 'assumed';
  // area strip: q (kPa) × tributary width (m), from x1 to x2
  q: number;
  trib: number;
  // line: w1 at x1 to w2 at x2 (kN/m)
  x1: number;
  x2: number;
  w1: number;
  w2: number;
  // point / moment
  x: number;
  P: number;
  M: number;
}

export interface SupportRow {
  id: string;
  x: number;
  type: SupportType;
  /** mm; empty = unknown */
  bearingLength: number | null;
}

export interface MemberForm {
  name: string;
  length: number;
  species: string;
  size: string;
  plies: number;
  braced: boolean;
  wetOrExterior: boolean;
  selfWeight: boolean;
  KSfb: number | null;
  KSfv: number | null;
  KSfcp: number | null;
  KSE: number | null;
  KT: number | null;
  supports: SupportRow[];
  loads: LoadRow[];
}

let counter = 0;
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;

export function blankLoad(pattern: Pattern, length: number): LoadRow {
  return { id: newId('ld'), pattern, shape: 'area', label: '', status: 'assumed', q: 0, trib: 1, x1: 0, x2: length, w1: 0, w2: 0, x: length / 2, P: 0, M: 0 };
}

/** Convert one form row to an engine load. Area strips become line loads w = q × width. */
export function rowToLoad(r: LoadRow): MemberLoad {
  const label = r.label || defaultLabel(r);
  switch (r.shape) {
    case 'area':
      return { id: r.id, pattern: r.pattern, label, shape: 'line', x1: r.x1, x2: r.x2, w1: r.q * r.trib, w2: r.q * r.trib };
    case 'line':
      return { id: r.id, pattern: r.pattern, label, shape: 'line', x1: r.x1, x2: r.x2, w1: r.w1, w2: r.w2 };
    case 'point':
      return { id: r.id, pattern: r.pattern, label, shape: 'point', x: r.x, P: r.P };
    case 'moment':
      return { id: r.id, pattern: r.pattern, label, shape: 'moment', x: r.x, M: r.M };
  }
}

export function defaultLabel(r: LoadRow): string {
  switch (r.shape) {
    case 'area':
      return `${r.pattern} ${r.q} kPa × ${r.trib} m`;
    case 'line':
      return r.w1 === r.w2 ? `${r.pattern} ${r.w1} kN/m` : `${r.pattern} ${r.w1}→${r.w2} kN/m`;
    case 'point':
      return `${r.pattern} ${r.P} kN at ${r.x} m`;
    case 'moment':
      return `${r.pattern} ${r.M} kN·m at ${r.x} m`;
  }
}

export function formToInput(f: MemberForm, settings: ProjectSettings): MemberInput {
  const KS: Record<string, number> = {};
  if (f.KSfb !== null) KS.fb = f.KSfb;
  if (f.KSfv !== null) KS.fv = f.KSfv;
  if (f.KSfcp !== null) KS.fcp = f.KSfcp;
  if (f.KSE !== null) KS.E = f.KSE;
  return {
    length: f.length,
    supports: f.supports.map((s) => ({ id: s.id, x: s.x, type: s.type, bearingLength: s.bearingLength })),
    section: { species: f.species, size: f.size, plies: f.plies },
    compressionEdgeBraced: f.braced,
    wetOrExterior: f.wetOrExterior,
    includeSelfWeight: f.selfWeight,
    loads: f.loads.map(rowToLoad),
    overrides: { ...(Object.keys(KS).length ? { KS } : {}), ...(f.KT !== null ? { KT: f.KT } : {}) },
    settings,
  };
}

const L = (pattern: Pattern, shape: LoadShapeForm, o: Partial<LoadRow>): LoadRow => ({ ...blankLoad(pattern, 0), shape, ...o, id: newId('ld') });
const base = {
  species: 'SPF No.1/No.2',
  size: '2x10',
  plies: 3,
  braced: true,
  wetOrExterior: false,
  selfWeight: true,
  KSfb: null,
  KSfv: null,
  KSfcp: null,
  KSE: null,
  KT: null,
};

export const PRESETS: { key: string; title: string; form: () => MemberForm }[] = [
  {
    key: 'A',
    title: 'Test A: 4.0 m simple span',
    form: () => ({
      ...base,
      name: 'Test A',
      length: 4,
      supports: [
        { id: 'A', x: 0, type: 'pin', bearingLength: null },
        { id: 'B', x: 4, type: 'roller', bearingLength: null },
      ],
      loads: [
        L('D', 'area', { label: 'Floor dead', q: 0.6, trib: 4, x1: 0, x2: 4 }),
        L('L', 'area', { label: 'Floor live', q: 1.9, trib: 4, x1: 0, x2: 4 }),
      ],
    }),
  },
  {
    key: 'B',
    title: 'Test B: 3.6 m with line and point loads',
    form: () => ({
      ...base,
      name: 'Test B',
      length: 3.6,
      supports: [
        { id: 'A', x: 0, type: 'pin', bearingLength: null },
        { id: 'B', x: 3.6, type: 'roller', bearingLength: null },
      ],
      loads: [
        L('D', 'area', { label: 'Floor dead', q: 0.6, trib: 2.5, x1: 0, x2: 3.6 }),
        L('L', 'area', { label: 'Floor live', q: 1.9, trib: 2.5, x1: 0, x2: 3.6 }),
        L('D', 'line', { label: 'Wall above', w1: 1, w2: 1, x1: 0, x2: 3.6 }),
        L('D', 'point', { label: 'Post from above', P: 5, x: 1.8 }),
      ],
    }),
  },
  {
    key: 'L',
    title: 'Test L: two equal spans, live load (pattern)',
    form: () => ({
      ...base,
      name: 'Two spans',
      length: 8,
      selfWeight: false,
      supports: [
        { id: 'A', x: 0, type: 'pin', bearingLength: null },
        { id: 'B', x: 4, type: 'pin', bearingLength: null },
        { id: 'C', x: 8, type: 'roller', bearingLength: null },
      ],
      loads: [L('L', 'line', { label: 'Live', w1: 5, w2: 5, x1: 0, x2: 8 })],
    }),
  },
  {
    key: 'cant',
    title: 'Beam with 1.2 m cantilever and snow',
    form: () => ({
      ...base,
      name: 'Cantilever',
      length: 4.8,
      size: '2x12',
      supports: [
        { id: 'A', x: 0, type: 'pin', bearingLength: 89 },
        { id: 'B', x: 3.6, type: 'roller', bearingLength: 140 },
      ],
      loads: [
        L('D', 'area', { label: 'Roof dead', q: 0.5, trib: 2, x1: 0, x2: 4.8 }),
        L('S', 'area', { label: 'Roof snow (before Is)', q: 1.6, trib: 2, x1: 0, x2: 4.8 }),
        L('D', 'point', { label: 'Railing post', P: 1.5, x: 4.8 }),
      ],
    }),
  },
];
