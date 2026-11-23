// Section properties for sawn lumber (solid or nailed built-up of equal plies).
import type { CodeValues, SawnSection, Strengths } from './types';
import { Uses } from './trace';

export interface SectionProps {
  b: number; // mm, total width of all plies
  d: number; // mm, depth
  plies: number;
  A: number; // mm²
  S: number; // mm³
  I: number; // mm⁴
  selfWeight: number; // kN/m
  KZ: number; // size factor for bending and shear
  strengths: Strengths;
  species: string;
  size: string;
}

export function sectionProps(sec: SawnSection, cv: CodeValues, uses: Uses): SectionProps {
  const depths = uses.cv(cv.depths);
  const d = depths[sec.size];
  if (d === undefined) throw new Error(`Unknown lumber size "${sec.size}".`);
  if (!Number.isInteger(sec.plies) || sec.plies < 1 || sec.plies > 4) {
    throw new Error(`Plies must be a whole number from 1 to 4 (got ${sec.plies}).`);
  }
  const strengths = uses.cv(cv.strengths)[sec.species];
  if (!strengths) throw new Error(`Unknown species and grade "${sec.species}".`);
  const KZ = uses.cv(cv.sizeFactorBendingShear)[String(d)];
  if (KZ === undefined) throw new Error(`No size factor for depth ${d} mm.`);
  const b = sec.plies * uses.cv(cv.plyThickness);
  const A = b * d;
  const density = uses.cv(cv.woodDensity); // kN/m³
  return {
    b,
    d,
    plies: sec.plies,
    A,
    S: (b * d * d) / 6,
    I: (b * d ** 3) / 12,
    selfWeight: A * 1e-6 * density,
    KZ,
    strengths,
    species: sec.species,
    size: sec.size,
  };
}
