// Edit operations on a Project draft (used inside immer). Each one is a pure change to the draft.
import type { Beam, DrawingDefaults, Element, ElementKind, Level, Opening, Post, Project, Pt, SectionRef, Surface, SurfaceRole, Wall } from './types';
import { beamTop, beamsThrough, headerEnds, headerTop, levelOf, lengthOf, sortedLevels, type SectionTable } from './geometry';

let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}${rnd}`;
}

const PREFIX: Record<ElementKind | 'header' | 'roof', string> = { wall: 'W', beam: 'B', post: 'P', surface: 'F', opening: 'O', header: 'H', roof: 'R' };

export function nextLabel(p: Project, key: keyof typeof PREFIX): string {
  const pre = PREFIX[key];
  let n = 1;
  const used = new Set(p.elements.map((e) => e.label));
  while (used.has(`${pre}${n}`)) n++;
  return `${pre}${n}`;
}

export function defaultDrawing(): DrawingDefaults {
  const sp = 'SPF No.1/No.2';
  return {
    mode: 'existing',
    bareUnit: 'mm',
    snapPx: 10,
    grid: 500,
    studSize: '2x6',
    studSpacing: 406,
    plates: 3,
    wallThickness: 140,
    beamSection: { species: sp, size: '2x10', plies: 3 },
    postSection: { species: sp, size: '2x6', plies: 3 },
    headerSection: { species: sp, size: '2x10', plies: 2 },
    headerBearing: 38,
    openingHeight: 2032,
    plateThickness: 38,
  };
}

export function newProject(name = 'New project'): Project {
  return {
    id: newId('prj'),
    info: { name, address: '', municipality: '', codeEdition: '2024 OBC (O. Reg. 163/24)', engineer: '', occupancy: 'Residential' },
    defaults: defaultDrawing(),
    levels: [{ id: newId('lvl'), name: 'Ground floor', elevation: 0, wallHeight: 2470, floorDepth: 300 }],
    elements: [],
  };
}

const base = (p: Project, levelId: string, label: string) => ({
  id: '',
  levelId,
  label,
  status: 'assumed' as const,
  lifecycle: p.defaults.mode,
  notes: '',
});

// ---------- Levels ----------

export function addLevel(p: Project, fromId: string, where: 'above' | 'below', name?: string): Level {
  const from = levelOf(p, fromId);
  const lvl: Level = { id: newId('lvl'), name: name ?? '', elevation: 0, wallHeight: from.wallHeight, floorDepth: from.floorDepth };
  lvl.elevation = where === 'above' ? from.elevation + from.wallHeight + lvl.floorDepth : from.elevation - (lvl.wallHeight + from.floorDepth);
  if (!lvl.name) lvl.name = where === 'above' ? `Level above ${from.name}` : `Level below ${from.name}`;
  p.levels.push(lvl);
  return lvl;
}

/** Copy a level and every element on it. New IDs; links inside the level are remapped; links to other levels are cleared. */
export function copyLevel(p: Project, levelId: string, where: 'above' | 'below', tables: SectionTable): Level {
  const src = levelOf(p, levelId);
  const lvl = addLevel(p, levelId, where, `${src.name} (copy)`);
  const map = new Map<string, string>();
  const srcEls = p.elements.filter((e) => e.levelId === levelId);
  for (const e of srcEls) map.set(e.id, newId(e.kind));
  const remap = (id: string | null) => (id && map.has(id) ? map.get(id)! : null);
  const dz = lvl.elevation - src.elevation;
  for (const e of srcEls) {
    const c = JSON.parse(JSON.stringify(e)) as Element;
    c.id = map.get(e.id)!;
    c.levelId = lvl.id;
    if (c.kind === 'opening') {
      c.wallId = remap(c.wallId)!;
      c.headerId = remap(c.headerId);
    } else if (c.kind === 'beam') {
      c.openingId = remap(c.openingId);
      if (c.elevationMode === 'custom') c.topElevation += dz;
    } else if (c.kind === 'post') {
      c.baseId = remap(c.baseId);
      c.supportsId = remap(c.supportsId);
    }
    p.elements.push(c);
  }
  syncDerived(p, tables);
  return lvl;
}

export function deleteLevel(p: Project, levelId: string): void {
  if (p.levels.length <= 1) throw new Error('A project needs at least one level.');
  const ids = p.elements.filter((e) => e.levelId === levelId).map((e) => e.id);
  for (const id of ids) if (p.elements.some((e) => e.id === id)) deleteElement(p, id);
  p.levels = p.levels.filter((l) => l.id !== levelId);
}

// ---------- Elements ----------

export function addWall(p: Project, levelId: string, a: Pt, b: Pt, over: Partial<Wall> = {}): Wall {
  const lvl = levelOf(p, levelId);
  const d = p.defaults;
  const w: Wall = {
    ...base(p, levelId, nextLabel(p, 'wall')),
    kind: 'wall',
    a: { ...a },
    b: { ...b },
    thickness: d.wallThickness,
    height: lvl.wallHeight,
    studSize: d.studSize,
    studSpacing: d.studSpacing,
    plates: d.plates,
    bearing: false,
    ...over,
    id: newId('wall'),
  };
  p.elements.push(w);
  return w;
}

export function addBeam(p: Project, levelId: string, a: Pt, b: Pt, tables: SectionTable, over: Partial<Beam> = {}): Beam {
  const lvl = levelOf(p, levelId);
  const bm: Beam = {
    ...base(p, levelId, nextLabel(p, 'beam')),
    kind: 'beam',
    role: 'beam',
    a: { ...a },
    b: { ...b },
    section: { ...p.defaults.beamSection },
    elevationMode: 'dropped',
    topElevation: lvl.elevation - lvl.floorDepth,
    bearingA: null,
    bearingB: null,
    openingId: null,
    ...over,
    id: newId('beam'),
  };
  p.elements.push(bm);
  syncDerived(p, tables);
  return bm;
}

/** A new post links automatically to the nearest beam above it whose line passes through the post. */
export function addPost(p: Project, levelId: string, at: Pt, tables: SectionTable, tolMm = 1, over: Partial<Post> = {}): Post {
  const lvl = levelOf(p, levelId);
  const above = beamsThrough(p, at, tolMm, tables)
    .filter((b) => beamTop(p, b, tables) > lvl.elevation)
    .sort((x, y) => beamTop(p, x, tables) - beamTop(p, y, tables));
  const post: Post = {
    ...base(p, levelId, nextLabel(p, 'post')),
    kind: 'post',
    at: { ...at },
    section: { ...p.defaults.postSection },
    baseId: null,
    supportsId: above[0]?.id ?? null,
    ...over,
    id: newId('post'),
  };
  p.elements.push(post);
  return post;
}

export function addSurface(p: Project, levelId: string, role: SurfaceRole, polygon: Pt[], over: Partial<Surface> = {}): Surface {
  if (polygon.length < 3) throw new Error('A surface needs at least three corners.');
  const s: Surface = {
    ...base(p, levelId, nextLabel(p, role === 'roof' ? 'roof' : 'surface')),
    kind: 'surface',
    role,
    polygon: polygon.map((q) => ({ ...q })),
    spanDirection: 0,
    joistSize: null,
    joistSpacing: null,
    pitch: role === 'roof' ? 0 : null,
    ridgeDirection: role === 'roof' ? 0 : null,
    ...over,
    id: newId('surface'),
  };
  p.elements.push(s);
  return s;
}

/** Add an opening to a wall. It creates a header (assumed) with the project's default header section. */
export function addOpening(p: Project, wallId: string, offset: number, width: number, _tables: SectionTable, over: Partial<Opening> = {}): { opening: Opening; header: Beam } {
  const wall = p.elements.find((e): e is Wall => e.id === wallId && e.kind === 'wall');
  if (!wall) throw new Error('Openings go in walls. Pick a wall.');
  const L = lengthOf(wall);
  if (!(width > 0)) throw new Error('Opening width must be greater than zero.');
  if (offset < 0 || offset + width > L + 1e-6) throw new Error(`The opening does not fit in the wall (wall length ${(L / 1000).toFixed(3)} m).`);
  const d = p.defaults;
  const o: Opening = {
    ...base(p, wall.levelId, nextLabel(p, 'opening')),
    kind: 'opening',
    wallId,
    offset,
    width,
    height: d.openingHeight,
    sill: 0,
    headerId: null,
    ...over,
    id: newId('opening'),
  };
  p.elements.push(o);
  const ends = headerEnds(wall, o, d.headerBearing);
  const h: Beam = {
    ...base(p, wall.levelId, nextLabel(p, 'header')),
    kind: 'beam',
    role: 'header',
    a: ends.a,
    b: ends.b,
    section: { ...d.headerSection },
    elevationMode: 'custom',
    topElevation: headerTop(p, wall, d.plateThickness),
    bearingA: d.headerBearing,
    bearingB: d.headerBearing,
    openingId: o.id,
    notes: `Created with opening ${o.label}. Default section and one jack stud (${d.headerBearing} mm bearing) each end, assumed.`,
    id: newId('beam'),
  };
  p.elements.push(h);
  o.headerId = h.id;
  return { opening: o, header: h };
}

export function findEl(p: Project, id: string): Element {
  const e = p.elements.find((x) => x.id === id);
  if (!e) throw new Error(`Element ${id} not found.`);
  return e;
}

export function updateElement(p: Project, id: string, patch: Partial<Element>, tables: SectionTable): void {
  const e = findEl(p, id);
  Object.assign(e, patch);
  syncDerived(p, tables);
}

export function moveElement(p: Project, id: string, dx: number, dy: number, tables: SectionTable): void {
  const e = findEl(p, id);
  const mv = (q: Pt) => ({ x: q.x + dx, y: q.y + dy });
  if (e.kind === 'wall' || e.kind === 'beam') {
    e.a = mv(e.a);
    e.b = mv(e.b);
  } else if (e.kind === 'post') e.at = mv(e.at);
  else if (e.kind === 'surface') e.polygon = e.polygon.map(mv);
  syncDerived(p, tables);
}

export function moveEndpoint(p: Project, id: string, which: 'a' | 'b', to: Pt, tables: SectionTable): void {
  const e = findEl(p, id);
  if (e.kind !== 'wall' && e.kind !== 'beam') throw new Error('Only walls and beams have end points.');
  e[which] = { ...to };
  syncDerived(p, tables);
}

/** Delete an element and everything that depends on it. */
export function deleteElement(p: Project, id: string): void {
  const e = findEl(p, id);
  const gone = new Set<string>([id]);
  if (e.kind === 'wall') {
    for (const o of p.elements) if (o.kind === 'opening' && o.wallId === id) {
      gone.add(o.id);
      if (o.headerId) gone.add(o.headerId);
    }
  }
  if (e.kind === 'opening' && e.headerId) gone.add(e.headerId);
  p.elements = p.elements.filter((x) => !gone.has(x.id));
  for (const x of p.elements) {
    if (x.kind === 'post') {
      if (x.baseId && gone.has(x.baseId)) x.baseId = null;
      if (x.supportsId && gone.has(x.supportsId)) x.supportsId = null;
    }
    if (x.kind === 'opening' && x.headerId && gone.has(x.headerId)) x.headerId = null;
    if (x.kind === 'beam' && x.openingId && gone.has(x.openingId)) x.openingId = null;
  }
}

/** Keep derived geometry in step: header positions and flush/dropped beam elevations. */
export function syncDerived(p: Project, tables: SectionTable): void {
  for (const e of p.elements) {
    if (e.kind === 'beam' && e.openingId) {
      const o = p.elements.find((x): x is Opening => x.id === e.openingId && x.kind === 'opening');
      const w = o && p.elements.find((x): x is Wall => x.id === o.wallId && x.kind === 'wall');
      if (o && w) {
        const ends = headerEnds(w, o, e.bearingA ?? p.defaults.headerBearing);
        e.a = ends.a;
        e.b = ends.b;
        if (e.elevationMode === 'custom') e.topElevation = headerTop(p, w, p.defaults.plateThickness);
      }
    }
    if (e.kind === 'beam' && e.elevationMode !== 'custom') e.topElevation = beamTop(p, { ...e, elevationMode: e.elevationMode }, tables);
  }
}

/** Every element still assumed, plus other open items. */
export function openItems(p: Project, gate: 'confirmed' | 'unconfirmed'): string[] {
  const items: string[] = [];
  if (gate !== 'confirmed') items.push('Model is unconfirmed. Calculations stay locked until you click "Confirm model".');
  const lv = new Map(sortedLevels(p).map((l) => [l.id, l.name]));
  for (const e of p.elements) if (e.status === 'assumed') items.push(`${e.label} (${e.kind === 'beam' ? e.role : e.kind}, ${lv.get(e.levelId)}) is assumed.`);
  return items;
}

export function sectionLabel(s: SectionRef): string {
  return `${s.plies}-ply ${s.size} ${s.species}`;
}
