// Length input: feet-inches and metric. Values are stored in mm and shown in SI.
// Accepts 12'-6", 12' 6", 12'-6 1/2", 12', 150", 6 1/2", 3810mm, 3.81m, 381cm, and bare numbers.
import type { BareUnit } from './types';

const IN = 25.4;

export interface Parsed {
  ok: true;
  mm: number;
  /** How the input was read, e.g. "12'-6 1/2\" = 3822.7 mm". */
  explain: string;
}
export interface ParseError {
  ok: false;
  error: string;
}

const num = String.raw`\d+(?:\.\d+)?`;
const frac = String.raw`(?:(\d+)\s+)?(\d+)\/(\d+)`; // "6 1/2" or "1/2"
const inchPart = String.raw`(?:${frac}|(${num}))`;

function inches(whole: string | undefined, fn: string | undefined, fd: string | undefined, plain: string | undefined): number {
  if (plain !== undefined) return Number(plain);
  const d = Number(fd);
  if (!d) return NaN;
  return Number(whole ?? 0) + Number(fn) / d;
}

export function parseLength(raw: string, bareUnit: BareUnit): Parsed | ParseError {
  const s0 = raw.trim().replace(/[’′]/g, "'").replace(/[”″]/g, '"').replace(/''/g, '"');
  if (s0 === '') return { ok: false, error: 'Enter a length.' };
  let sign = 1;
  let s = s0;
  if (s.startsWith('-')) {
    sign = -1;
    s = s.slice(1).trim();
  }
  const done = (mm: number, how: string): Parsed | ParseError =>
    Number.isFinite(mm) ? { ok: true, mm: sign * mm, explain: `${s0} = ${fmtMm(sign * mm)}` + (how ? ` (${how})` : '') } : { ok: false, error: `Cannot read "${raw}".` };

  // feet with optional inches: 12'  12'-6"  12' 6"  12'-6 1/2"  12'6"
  let m = s.match(new RegExp(String.raw`^(${num})\s*'\s*(?:-?\s*${inchPart}\s*"?)?$`));
  if (m) {
    const ft = Number(m[1]);
    const hasIn = m[2] !== undefined || m[3] !== undefined || m[5] !== undefined;
    const inch = hasIn ? inches(m[2], m[3], m[4], m[5]) : 0;
    return done((ft * 12 + inch) * IN, 'feet-inches');
  }
  // inches only: 150"  6 1/2"
  m = s.match(new RegExp(String.raw`^${inchPart}\s*"$`));
  if (m) return done(inches(m[1], m[2], m[3], m[4]) * IN, 'inches');
  // metric with unit
  m = s.match(new RegExp(String.raw`^(${num})\s*(mm|cm|m)$`, 'i'));
  if (m) {
    const v = Number(m[1]);
    const u = m[2]!.toLowerCase();
    return done(u === 'mm' ? v : u === 'cm' ? v * 10 : v * 1000, '');
  }
  // bare number
  m = s.match(new RegExp(String.raw`^(${num})$`));
  if (m) {
    const v = Number(m[1]);
    const mm = bareUnit === 'mm' ? v : bareUnit === 'm' ? v * 1000 : bareUnit === 'in' ? v * IN : v * 12 * IN;
    return done(mm, `bare number read as ${bareUnit}`);
  }
  return { ok: false, error: `Cannot read "${raw}". Try 3810mm, 3.81m, 12'-6" or 150".` };
}

export function fmtMm(mm: number): string {
  return `${round(mm, 1)} mm`;
}
export function fmtM(mm: number, digits = 3): string {
  return `${(mm / 1000).toFixed(digits)} m`;
}
export function round(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
