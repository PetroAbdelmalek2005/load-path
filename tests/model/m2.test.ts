// Milestone 2 acceptance tests that run without a screen (see docs/ACCEPTANCE_TESTS.md).
import { describe, expect, it } from 'vitest';
import { createModelStore } from '../../src/model/store';
import { addBeam, addLevel, addOpening, addPost, addSurface, addWall, copyLevel, deleteElement, moveElement, newProject, openItems, updateElement } from '../../src/model/edits';
import { dist, polar, postGeometry, snapPoint } from '../../src/model/geometry';
import { parseFile, serialize } from '../../src/model/persist';
import { parseLength } from '../../src/model/units';
import { sectionTables } from '../../src/model/codeValues';
import type { Beam, Opening, Post, Project, Pt, Wall } from '../../src/model/types';

const T = sectionTables();

/** Draw a closed rectangle by typed lengths, the way the wall tool does: each wall starts where the last ended. */
function drawRect(store: ReturnType<typeof createModelStore>, lenX: string, lenY: string) {
  const lv = store.getState().project.levels[0]!.id;
  const Lx = parseLength(lenX, 'mm');
  const Ly = parseLength(lenY, 'mm');
  if (!Lx.ok || !Ly.ok) throw new Error('parse');
  let p: Pt = { x: 0, y: 0 };
  const start = p;
  for (const [len, deg] of [
    [Lx.mm, 0],
    [Ly.mm, 90],
    [Lx.mm, 180],
    [Ly.mm, 270],
  ] as const) {
    const q = polar(p, len, deg);
    store.getState().apply('Add wall', (d) => void addWall(d, lv, p, q));
    p = q;
  }
  return { start, end: p };
}

describe('M2-A closed rectangle by typed lengths', () => {
  it('8.0 m × 6.0 m closes within 1 mm', () => {
    const s = createModelStore();
    const { start, end } = drawRect(s, '8.0m', '6.0m');
    expect(dist(start, end)).toBeLessThan(1);
    const walls = s.getState().project.elements as Wall[];
    expect(walls.map((w) => Math.round(dist(w.a, w.b)))).toEqual([8000, 6000, 8000, 6000]);
  });
  it("26'-3\" × 19'-8 1/4\" closes within 1 mm", () => {
    const s = createModelStore();
    const { start, end } = drawRect(s, `26'-3"`, `19'-8 1/4"`);
    expect(dist(start, end)).toBeLessThan(1);
    const w = s.getState().project.elements[0] as Wall;
    expect(dist(w.a, w.b)).toBeCloseTo(8001.0, 6);
    const w2 = s.getState().project.elements[1] as Wall;
    expect(dist(w2.a, w2.b)).toBeCloseTo(6000.75, 6);
  });
});

describe('M2-B undo and redo', () => {
  it('20 edits including a delete, a level copy and an opening: undo all, redo all, deep-equal at each end', () => {
    const s = createModelStore();
    const st = () => s.getState();
    const lv = st().project.levels[0]!.id;
    const start = structuredClone(st().project);
    drawRect(s, '8m', '6m'); // 4
    const w0 = (st().project.elements[0] as Wall).id;
    st().apply('Opening', (d) => void addOpening(d, w0, 1000, 900, T)); // 5
    st().apply('Beam', (d) => void addBeam(d, lv, { x: 0, y: 3000 }, { x: 8000, y: 3000 }, T)); // 6
    st().apply('Post', (d) => void addPost(d, lv, { x: 4000, y: 3000 }, T)); // 7
    st().apply('Floor', (d) => void addSurface(d, lv, 'floor', [{ x: 0, y: 0 }, { x: 8000, y: 0 }, { x: 8000, y: 6000 }, { x: 0, y: 6000 }])); // 8
    for (let i = 0; i < 6; i++) st().apply('Move', (d) => moveElement(d, w0, 10, 0, T)); // 14
    st().apply('Label', (d) => updateElement(d, w0, { label: 'North wall' }, T), { geometry: false }); // 15
    st().apply('Copy level', (d) => void copyLevel(d, lv, 'above', T)); // 16
    const w1 = (st().project.elements[1] as Wall).id;
    st().apply('Delete', (d) => deleteElement(d, w1)); // 17
    st().apply('Level', (d) => void addLevel(d, lv, 'below')); // 18
    st().apply('Bearing', (d) => updateElement(d, w0, { bearing: true }, T)); // 19
    st().apply('Height', (d) => updateElement(d, w0, { height: 2700 }, T)); // 20
    expect(st().past.length).toBe(20);
    const end = structuredClone(st().project);
    while (st().past.length) st().undo();
    expect(st().project).toEqual(start);
    while (st().future.length) st().redo();
    expect(st().project).toEqual(end);
  });
});

describe('M2-C save round trip', () => {
  it('deep-equal, IDs included', () => {
    const s = createModelStore();
    drawRect(s, '8m', '6m');
    const w0 = (s.getState().project.elements[0] as Wall).id;
    s.getState().apply('Opening', (d) => void addOpening(d, w0, 1000, 900, T));
    const text = serialize(s.getState().project, s.getState().gate);
    const r = parseFile(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.project).toEqual(s.getState().project);
  });
});

describe('M2-D copy level', () => {
  it('new level at the right elevation, every element copied with a new ID', () => {
    const s = createModelStore();
    drawRect(s, '8m', '6m');
    const p0 = s.getState().project;
    const lv = p0.levels[0]!;
    const w0 = (p0.elements[0] as Wall).id;
    s.getState().apply('Opening', (d) => void addOpening(d, w0, 1000, 900, T));
    const before = s.getState().project.elements.length;
    s.getState().apply('Copy', (d) => void copyLevel(d, lv.id, 'above', T));
    const p = s.getState().project;
    const nl = p.levels[1]!;
    expect(nl.elevation).toBe(lv.elevation + lv.wallHeight + lv.floorDepth); // 2770 mm
    expect(nl.elevation).toBe(2770);
    const copies = p.elements.filter((e) => e.levelId === nl.id);
    expect(copies.length).toBe(before);
    const oldIds = new Set(p.elements.filter((e) => e.levelId === lv.id).map((e) => e.id));
    for (const c of copies) expect(oldIds.has(c.id)).toBe(false);
    const op = copies.find((e): e is Opening => e.kind === 'opening')!;
    expect(copies.some((e) => e.id === op.wallId)).toBe(true);
    expect(copies.some((e) => e.id === op.headerId)).toBe(true);
    const h = copies.find((e): e is Beam => e.kind === 'beam')!;
    expect(h.topElevation).toBe(2770 + 2470 - 2 * 38);
  });
});

describe('M2-E model gate', () => {
  it('confirm, move a wall: unconfirmed. Undo the move: still unconfirmed', () => {
    const s = createModelStore();
    drawRect(s, '8m', '6m');
    s.getState().confirm();
    expect(s.getState().gate).toBe('confirmed');
    s.getState().apply('Label', (d) => updateElement(d, d.elements[0]!.id, { notes: 'x' }, T), { geometry: false });
    expect(s.getState().gate).toBe('confirmed');
    const id = s.getState().project.elements[0]!.id;
    s.getState().apply('Move', (d) => moveElement(d, id, 100, 0, T));
    expect(s.getState().gate).toBe('unconfirmed');
    s.getState().undo();
    expect(s.getState().gate).toBe('unconfirmed');
  });
  it('a level copy is a geometry change', () => {
    const s = createModelStore();
    s.getState().confirm();
    const lv = s.getState().project.levels[0]!.id;
    s.getState().apply('Copy', (d) => void copyLevel(d, lv, 'above', T));
    expect(s.getState().gate).toBe('unconfirmed');
  });
});

describe('M2-G snapping', () => {
  it('a beam end within the snap distance of a post snaps exactly onto the post', () => {
    const s = createModelStore();
    const lv = s.getState().project.levels[0]!.id;
    s.getState().apply('Post', (d) => void addPost(d, lv, { x: 3000.3, y: 1999.7 }, T));
    const p = s.getState().project;
    const post = p.elements[0] as Post;
    const tol = 10 * 5; // 10 px at 5 mm per pixel
    const snap = snapPoint({ x: 3030, y: 2020 }, p, [lv], tol, 500);
    expect(snap.kind).toBe('post');
    expect(snap.pt).toEqual(post.at);
    const far = snapPoint({ x: 3060, y: 2040 }, p, [lv], tol, null);
    expect(far.kind).toBe('none');
  });
});

describe('M2-H open items', () => {
  it('lists every assumed element', () => {
    const s = createModelStore();
    drawRect(s, '8m', '6m');
    const p = s.getState().project;
    expect(openItems(p, 'unconfirmed').filter((x) => /is assumed/.test(x)).length).toBe(4);
    s.getState().apply('Verify', (d) => updateElement(d, d.elements[0]!.id, { status: 'verified' }, T), { geometry: false });
    expect(openItems(s.getState().project, 'unconfirmed').filter((x) => /is assumed/.test(x)).length).toBe(3);
  });
});

describe('M2-I file version', () => {
  const good = () => JSON.parse(serialize(newProject(), 'unconfirmed'));
  it('rejects a newer version with a clear message', () => {
    const f = good();
    f.schemaVersion = 99;
    const r = parseFile(JSON.stringify(f));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/newer version.*Nothing was changed/s);
  });
  it('rejects an older or missing version, damaged JSON and other apps', () => {
    const f = good();
    f.schemaVersion = 0;
    expect(parseFile(JSON.stringify(f)).ok).toBe(false);
    delete f.schemaVersion;
    expect(parseFile(JSON.stringify(f)).ok).toBe(false);
    expect(parseFile('{not json').ok).toBe(false);
    expect(parseFile('{"app":"other"}').ok).toBe(false);
  });
  it('rejects a file with a broken link', () => {
    const s = createModelStore();
    const lv = s.getState().project.levels[0]!.id;
    s.getState().apply('w', (d) => void addWall(d, lv, { x: 0, y: 0 }, { x: 5000, y: 0 }));
    s.getState().apply('o', (d) => void addOpening(d, d.elements[0]!.id, 500, 900, T));
    const f = JSON.parse(serialize(s.getState().project, 'unconfirmed'));
    f.project.elements = f.project.elements.filter((e: { kind: string }) => e.kind !== 'wall');
    const r = parseFile(JSON.stringify(f));
    expect(r.ok).toBe(false);
  });
});

describe('M2-J opening header', () => {
  it('creates a header marked assumed with the default section', () => {
    const p: Project = newProject();
    const lv = p.levels[0]!.id;
    const w = addWall(p, lv, { x: 0, y: 0 }, { x: 6000, y: 0 });
    const { opening, header } = addOpening(p, w.id, 2000, 1200, T);
    expect(header.status).toBe('assumed');
    expect(header.role).toBe('header');
    expect(header.section).toEqual({ species: 'SPF No.1/No.2', size: '2x10', plies: 2 });
    expect(header.bearingA).toBe(38);
    expect(dist(header.a, header.b)).toBeCloseTo(1200 + 2 * 38, 9);
    expect(opening.headerId).toBe(header.id);
  });
});

describe('M2-K post length follows the beam', () => {
  it('moving the beam above a post updates the post length', () => {
    const s = createModelStore();
    const st = () => s.getState();
    const lv = st().project.levels[0]!.id;
    st().apply('Level below', (d) => void addLevel(d, lv, 'below', 'Basement'));
    const bsmt = st().project.levels[1]!;
    expect(bsmt.elevation).toBe(-2770);
    st().apply('Beam', (d) => void addBeam(d, lv, { x: 0, y: 3000 }, { x: 6000, y: 3000 }, T));
    st().apply('Post', (d) => void addPost(d, bsmt.id, { x: 3000, y: 3000 }, T));
    const post = () => st().project.elements.find((e): e is Post => e.kind === 'post')!;
    const beam = () => st().project.elements.find((e): e is Beam => e.kind === 'beam')!;
    expect(post().supportsId).toBe(beam().id);
    // dropped beam: top = 0 − 300; underside = −300 − 235; post base = −2770
    expect(postGeometry(st().project, post(), T).length).toBe(-300 - 235 + 2770);
    st().apply('Raise beam', (d) => updateElement(d, beam().id, { elevationMode: 'custom', topElevation: -100 }, T));
    expect(postGeometry(st().project, post(), T).length).toBe(-100 - 235 + 2770);
    st().apply('Deeper beam', (d) => updateElement(d, beam().id, { section: { species: 'SPF No.1/No.2', size: '2x12', plies: 3 } }, T));
    expect(postGeometry(st().project, post(), T).length).toBe(-100 - 286 + 2770);
  });
});

describe('M2-L bare numbers and ft-in', () => {
  it('a bare number uses the project unit, with an explanation', () => {
    const mm = parseLength('3810', 'mm');
    expect(mm.ok && mm.mm).toBe(3810);
    const m = parseLength('3.81', 'm');
    expect(m.ok && m.mm).toBe(3810);
    const ft = parseLength('12.5', 'ft');
    expect(ft.ok && ft.mm).toBeCloseTo(3810, 9);
    if (mm.ok) expect(mm.explain).toMatch(/bare number read as mm/);
  });
  it.each([
    [`12'-6"`, 3810],
    [`12' 6"`, 3810],
    [`12'6"`, 3810],
    [`12'-6 1/2"`, 3822.7],
    [`150"`, 3810],
    [`6 1/2"`, 165.1],
    [`3810mm`, 3810],
    [`3.81m`, 3810],
    [`381cm`, 3810],
    [`12'`, 3657.6],
    [`-1.2m`, -1200],
  ])('%s = %f mm', (txt, mm) => {
    const r = parseLength(txt, 'mm');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mm).toBeCloseTo(mm, 6);
  });
  it('rejects nonsense', () => {
    expect(parseLength('abc', 'mm').ok).toBe(false);
    expect(parseLength(`12'-6 1/0"`, 'mm').ok).toBe(false);
  });
});
