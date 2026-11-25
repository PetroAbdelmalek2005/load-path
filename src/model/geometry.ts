// Plan geometry, snapping and derived elevations. Pure functions. Lengths in mm.
import type { Beam, Element, Level, Opening, Post, Project, Pt, Surface, Wall } from './types';

export const dist = (p: Pt, q: Pt) => Math.hypot(q.x - p.x, q.y - p.y);
export const lengthOf = (e: { a: Pt; b: Pt }) => dist(e.a, e.b);
export const eq = (p: Pt, q: Pt) => p.x === q.x && p.y === q.y;

/** Point at distance `len` from p in direction `deg` (counter-clockwise from east). Exact for multiples of 90°. */
export function polar(p: Pt, len: number, deg: number): Pt {
  const n = ((deg % 360) + 360) % 360;
  if (n === 0) return { x: p.x + len, y: p.y };
  if (n === 90) return { x: p.x, y: p.y + len };
  if (n === 180) return { x: p.x - len, y: p.y };
  if (n === 270) return { x: p.x, y: p.y - len };
  const r = (n * Math.PI) / 180;
  return { x: p.x + len * Math.cos(r), y: p.y + len * Math.sin(r) };
}

export function angleDeg(p: Pt, q: Pt): number {
  return ((Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI + 360) % 360;
}

/** Nearest point on segment ab to p, with parameter t in [0, 1]. */
export function nearestOnSegment(p: Pt, a: Pt, b: Pt): { pt: Pt; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  if (L2 === 0) return { pt: { ...a }, t: 0 };
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return { pt: { x: a.x + t * dx, y: a.y + t * dy }, t };
}

export type SnapKind = 'endpoint' | 'post' | 'on-element' | 'grid' | 'none';
export interface Snap {
  pt: Pt;
  kind: SnapKind;
  targetId?: string;
}

/**
 * Snap a cursor point. Tolerance is in mm (the caller converts screen pixels to mm).
 * Priority: posts, element end points, points on walls and beams, grid. A snapped point equals its target exactly.
 */
export function snapPoint(p: Pt, project: Project, levelIds: string[], tolMm: number, grid: number | null, exclude: string[] = []): Snap {
  const els = project.elements.filter((e) => levelIds.includes(e.levelId) && !exclude.includes(e.id));
  // Each pass returns the nearest candidate within tolerance. Earlier passes win.
  const pass = (cands: { pt: Pt; kind: SnapKind; id?: string }[]): Snap | null => {
    let best: Snap | null = null;
    let bestD = tolMm;
    for (const c of cands) {
      const d = dist(p, c.pt);
      if (d <= bestD) {
        bestD = d;
        best = { pt: { ...c.pt }, kind: c.kind, targetId: c.id };
      }
    }
    return best;
  };
  const posts = els.flatMap((e) => (e.kind === 'post' ? [{ pt: e.at, kind: 'post' as const, id: e.id }] : []));
  const ends = els.flatMap((e) =>
    e.kind === 'wall' || e.kind === 'beam'
      ? [
          { pt: e.a, kind: 'endpoint' as const, id: e.id },
          { pt: e.b, kind: 'endpoint' as const, id: e.id },
        ]
      : e.kind === 'surface'
        ? e.polygon.map((v) => ({ pt: v, kind: 'endpoint' as const, id: e.id }))
        : [],
  );
  const on = els.flatMap((e) => (e.kind === 'wall' || e.kind === 'beam' ? [{ pt: nearestOnSegment(p, e.a, e.b).pt, kind: 'on-element' as const, id: e.id }] : []));
  const r = pass(posts) ?? pass(ends) ?? pass(on);
  if (r) return r;
  if (grid && grid > 0) {
    const g = { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid };
    if (dist(p, g) <= tolMm) return { pt: g, kind: 'grid' };
  }
  return { pt: { ...p }, kind: 'none' };
}

// ---------- Levels ----------

export const floorToFloor = (l: Level) => l.wallHeight + l.floorDepth;

export function levelOf(project: Project, levelId: string): Level {
  const l = project.levels.find((x) => x.id === levelId);
  if (!l) throw new Error(`Unknown level ${levelId}`);
  return l;
}

/** Levels sorted by elevation, lowest first. */
export function sortedLevels(project: Project): Level[] {
  return [...project.levels].sort((a, b) => a.elevation - b.elevation);
}

// ---------- Sections ----------

export function sectionDepth(size: string, depths: Record<string, number>): number {
  const d = depths[size];
  if (d === undefined) throw new Error(`Unknown size ${size}`);
  return d;
}

/** Width of a member: plies × ply thickness, mm. */
export function sectionWidth(plies: number, plyThickness: number): number {
  return plies * plyThickness;
}

export interface SectionTable {
  depths: Record<string, number>;
  plyThickness: number;
}

// ---------- Elevations ----------

/** Joist depth of the floor surface under a point on a level, if one is defined. */
export function floorJoistDepth(project: Project, levelId: string, at: Pt, tables: SectionTable): number | null {
  const s = project.elements.find(
    (e): e is Surface => e.kind === 'surface' && e.role === 'floor' && e.levelId === levelId && e.joistSize !== null && pointInPolygon(at, e.polygon),
  );
  if (!s || !s.joistSize) return null;
  return tables.depths[s.joistSize] ?? null;
}

/**
 * Top of beam, mm. Flush: beam top = joist top = level elevation − (floor depth − joist depth).
 * Dropped: beam top = joist underside = level elevation − floor depth. Custom: stored value.
 * Flush needs the floor's joist size; without it the stored value is used.
 */
export function beamTop(project: Project, beam: Beam, tables: SectionTable): number {
  const lvl = levelOf(project, beam.levelId);
  if (beam.elevationMode === 'dropped') return lvl.elevation - lvl.floorDepth;
  if (beam.elevationMode === 'flush') {
    const mid = { x: (beam.a.x + beam.b.x) / 2, y: (beam.a.y + beam.b.y) / 2 };
    const jd = floorJoistDepth(project, beam.levelId, mid, tables);
    if (jd !== null) return lvl.elevation - (lvl.floorDepth - jd);
  }
  return beam.topElevation;
}

export function wallBase(project: Project, w: Wall): number {
  return levelOf(project, w.levelId).elevation;
}
export function wallTop(project: Project, w: Wall): number {
  return wallBase(project, w) + w.height;
}

export interface PostGeometry {
  base: number;
  top: number;
  length: number;
  baseFrom: string;
  topFrom: string;
}

/** Post runs from the top of the element under it to the underside of the beam it supports. */
export function postGeometry(project: Project, post: Post, tables: SectionTable): PostGeometry {
  const lvl = levelOf(project, post.levelId);
  const byId = (id: string | null) => (id ? project.elements.find((e) => e.id === id) : undefined);
  const baseEl = byId(post.baseId);
  let base = lvl.elevation;
  let baseFrom = `floor of ${lvl.name}`;
  if (baseEl?.kind === 'wall') {
    base = wallTop(project, baseEl);
    baseFrom = `top of wall ${baseEl.label}`;
  } else if (baseEl?.kind === 'beam') {
    base = beamTop(project, baseEl, tables);
    baseFrom = `top of beam ${baseEl.label}`;
  }
  const topEl = byId(post.supportsId);
  let top = lvl.elevation + lvl.wallHeight;
  let topFrom = `wall height of ${lvl.name} (no beam linked)`;
  if (topEl?.kind === 'beam') {
    top = beamTop(project, topEl, tables) - sectionDepth(topEl.section.size, tables.depths);
    topFrom = `underside of beam ${topEl.label}`;
  }
  return { base, top, length: top - base, baseFrom, topFrom };
}

/** Beams on any level whose plan line passes through p (within tol), highest first. */
export function beamsThrough(project: Project, p: Pt, tolMm: number, tables: SectionTable): Beam[] {
  return project.elements
    .filter((e): e is Beam => e.kind === 'beam' && dist(nearestOnSegment(p, e.a, e.b).pt, p) <= tolMm)
    .sort((a, b) => beamTop(project, b, tables) - beamTop(project, a, tables));
}

// ---------- Openings ----------

export function openingEnds(wall: Wall, o: Opening): { s: Pt; e: Pt } {
  const L = lengthOf(wall);
  const ux = (wall.b.x - wall.a.x) / L;
  const uy = (wall.b.y - wall.a.y) / L;
  return {
    s: { x: wall.a.x + ux * o.offset, y: wall.a.y + uy * o.offset },
    e: { x: wall.a.x + ux * (o.offset + o.width), y: wall.a.y + uy * (o.offset + o.width) },
  };
}

/** Header end points: the opening plus one bearing length at each end. */
export function headerEnds(wall: Wall, o: Opening, bearing: number): { a: Pt; b: Pt } {
  const L = lengthOf(wall);
  const ux = (wall.b.x - wall.a.x) / L;
  const uy = (wall.b.y - wall.a.y) / L;
  const s = o.offset - bearing;
  const e = o.offset + o.width + bearing;
  return { a: { x: wall.a.x + ux * s, y: wall.a.y + uy * s }, b: { x: wall.a.x + ux * e, y: wall.a.y + uy * e } };
}

/** Header top: underside of the top plates (all plates but the bottom one). Assumed; see DECISIONS.md. */
export function headerTop(project: Project, wall: Wall, plateThickness: number): number {
  return wallTop(project, wall) - (wall.plates - 1) * plateThickness;
}

// ---------- Misc ----------

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function polygonArea(poly: Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function elementLength(e: Element): number | null {
  if (e.kind === 'wall' || e.kind === 'beam') return lengthOf(e);
  if (e.kind === 'opening') return e.width;
  return null;
}

/** Offset a segment sideways by d (positive = to the left of a→b). Used to draw a wall by a face. */
export function offsetSegment(a: Pt, b: Pt, d: number): { a: Pt; b: Pt } {
  const L = dist(a, b);
  if (L === 0) return { a, b };
  const nx = (-(b.y - a.y) / L) * d;
  const ny = ((b.x - a.x) / L) * d;
  return { a: { x: a.x + nx, y: a.y + ny }, b: { x: b.x + nx, y: b.y + ny } };
}
