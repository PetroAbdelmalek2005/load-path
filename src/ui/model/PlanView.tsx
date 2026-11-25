import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { modelStore, tables, useActiveLevelId, useModel, useUI, type Tool } from '../state';
import { addBeam, addPost, addSurface, addWall, deleteElement, moveElement, moveEndpoint } from '../../model/edits';
import { angleDeg, dist, lengthOf, nearestOnSegment, offsetSegment, openingEnds, pointInPolygon, polar, snapPoint, sortedLevels, type Snap } from '../../model/geometry';
import { parseLength } from '../../model/units';
import type { Element, Project, Pt, Wall } from '../../model/types';

interface ViewTf {
  cx: number;
  cy: number;
  scale: number; // px per mm
}

const HIT_PX = 7;

function fitView(p: Project, levelId: string, W: number, H: number): ViewTf {
  const pts: Pt[] = [];
  for (const e of p.elements) {
    if (e.levelId !== levelId) continue;
    if (e.kind === 'wall' || e.kind === 'beam') pts.push(e.a, e.b);
    else if (e.kind === 'post') pts.push(e.at);
    else if (e.kind === 'surface') pts.push(...e.polygon);
  }
  if (pts.length === 0) return { cx: 4000, cy: 3000, scale: Math.min(W / 12000, H / 9000) || 0.05 };
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  const w = Math.max(...xs) - Math.min(...xs) || 1000;
  const h = Math.max(...ys) - Math.min(...ys) || 1000;
  return { cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2, scale: Math.min(W / (w * 1.3), H / (h * 1.3)) };
}

const COLORS: Record<string, string> = { existing: 'var(--el-existing)', new: 'var(--el-new)', remove: 'var(--el-remove)' };

export function PlanView({ readOnly }: { readOnly: boolean }) {
  const project = useModel((s) => s.project);
  const apply = useModel((s) => s.apply);
  const levelId = useActiveLevelId();
  const { tool, selectedId, ortho, wallRef, set } = useUI();
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ W: 800, H: 560 });
  const [tf, setTf] = useState<ViewTf | null>(null);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [chain, setChain] = useState<Pt[]>([]); // points placed in the current wall/beam chain or polygon
  const [typed, setTypedState] = useState<string>('');
  const typedRef = useRef('');
  const setTyped = (t: string | ((x: string) => string)) => {
    const v = typeof t === 'function' ? t(typedRef.current) : t;
    typedRef.current = v;
    setTypedState(v);
  };
  const [drag, setDrag] = useState<null | { kind: 'pan' | 'move' | 'end'; start: Pt; last: Pt; which?: 'a' | 'b'; id?: string; screen0: { x: number; y: number }; moved: boolean }>(null);
  const [preview, setPreview] = useState<Project | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Size to container
  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ W: el.clientWidth, H: Math.max(360, el.clientHeight) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Fit when the level changes
  useEffect(() => {
    setTf(fitView(modelStore.getState().project, levelId, size.W, size.H));
    setChain([]);
    setTyped('');
  }, [levelId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setChain([]);
    setTyped('');
    setMsg(null);
  }, [tool]);

  const view = tf ?? fitView(project, levelId, size.W, size.H);
  const toS = useCallback((p: Pt) => ({ x: (p.x - view.cx) * view.scale + size.W / 2, y: size.H / 2 - (p.y - view.cy) * view.scale }), [view, size]);
  const toW = useCallback((x: number, y: number): Pt => ({ x: (x - size.W / 2) / view.scale + view.cx, y: (size.H / 2 - y) / view.scale + view.cy }), [view, size]);
  const tolMm = project.defaults.snapPx / view.scale;

  const shown = preview ?? project;
  const levels = sortedLevels(shown);
  const li = levels.findIndex((l) => l.id === levelId);
  const below = li > 0 ? levels[li - 1]!.id : null;
  const els = shown.elements.filter((e) => e.levelId === levelId);
  const ghost = below ? shown.elements.filter((e) => e.levelId === below) : [];

  const eventPt = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };

  /** Apply ortho to the direction from the last chain point. */
  const constrain = (from: Pt, to: Pt): Pt => {
    if (!ortho) return to;
    const a = Math.round(angleDeg(from, to) / 90) * 90;
    return polar(from, dist(from, to) * Math.abs(Math.cos(((angleDeg(from, to) - a) * Math.PI) / 180)), a);
  };

  const doSnap = (w: Pt, exclude: string[] = []): Snap => snapPoint(w, project, [levelId, ...(below ? [below] : [])], tolMm, project.defaults.grid, exclude);

  const hitTest = (sx: number, sy: number): Element | null => {
    const w = toW(sx, sy);
    const tol = HIT_PX / view.scale;
    let best: { e: Element; d: number } | null = null;
    const consider = (e: Element, d: number) => {
      if (d <= tol && (!best || d < best.d)) best = { e, d };
    };
    for (const e of els) {
      if (e.kind === 'post') consider(e, Math.max(0, dist(w, e.at) - 60));
      else if (e.kind === 'wall' || e.kind === 'beam') {
        const half = e.kind === 'wall' ? e.thickness / 2 : (e.section.plies * tables.plyThickness) / 2;
        consider(e, Math.max(0, dist(w, nearestOnSegment(w, e.a, e.b).pt) - half) + (e.kind === 'wall' ? tol * 0.3 : 0));
      } else if (e.kind === 'opening') {
        const wall = els.find((x): x is Wall => x.id === e.wallId);
        if (wall) {
          const { s, e: en } = openingEnds(wall, e);
          consider(e, Math.max(0, dist(w, nearestOnSegment(w, s, en).pt) - wall.thickness / 2) + tol * 0.2); // beams and headers win where they overlap
        }
      }
    }
    if (best) return (best as { e: Element }).e;
    for (const e of els) if (e.kind === 'surface' && pointInPolygon(w, e.polygon)) return e;
    return null;
  };

  // ---------- Placing points ----------

  const placeLinePoint = (pt: Pt) => {
    const kind = tool as 'wall' | 'beam';
    if (chain.length === 0) {
      setChain([pt]);
      return;
    }
    const a = chain[chain.length - 1]!;
    if (dist(a, pt) < 1) return;
    if (kind === 'wall') {
      const off = wallRef === 'centre' ? 0 : (project.defaults.wallThickness / 2) * (wallRef === 'left' ? -1 : 1);
      const seg = off ? offsetSegment(a, pt, off) : { a, b: pt };
      apply('Add wall', (d) => void addWall(d, levelId, seg.a, seg.b));
    } else {
      apply('Add beam', (d) => void addBeam(d, levelId, a, pt, tables));
    }
    setChain(kind === 'wall' ? [pt] : []);
    setTyped('');
  };

  const placePolyPoint = (pt: Pt) => {
    if (chain.length >= 3 && dist(pt, chain[0]!) <= tolMm) return finishPoly();
    setChain([...chain, pt]);
  };
  const finishPoly = () => {
    if (chain.length < 3) return setMsg('A surface needs at least three corners.');
    const role = tool === 'roof' ? 'roof' : 'floor';
    apply(role === 'roof' ? 'Add roof surface' : 'Add floor surface', (d) => void addSurface(d, levelId, role, chain));
    setChain([]);
  };

  const commitTyped = (text: string = typedRef.current) => {
    const r = parseLength(text, project.defaults.bareUnit);
    if (!r.ok) return setMsg(r.error);
    if (chain.length === 0) return setMsg('Click a start point first, then type the length.');
    const a = chain[chain.length - 1]!;
    const dirTo = cursor ? constrain(a, cursor) : polar(a, 1, 0);
    const deg = dist(a, dirTo) > 0 ? angleDeg(a, dirTo) : 0;
    const exact = ortho ? Math.round(deg / 90) * 90 : deg;
    const end = polar(a, r.mm, exact);
    if (tool === 'wall' || tool === 'beam') placeLinePoint(end);
    else if (tool === 'floor' || tool === 'roof') placePolyPoint(end);
    setTyped('');
    setMsg(null);
  };

  // ---------- Keyboard ----------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'SELECT' || tgt.tagName === 'TEXTAREA') && tgt.id !== 'typed-length') return;
      const st = modelStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        st.redo();
        return;
      }
      if (readOnly) return;
      if (e.key === 'Escape') {
        if (typed) setTyped('');
        else if (chain.length) setChain([]);
        else set({ tool: 'select', selectedId: null });
        return;
      }
      const drawing = (tool === 'wall' || tool === 'beam' || tool === 'floor' || tool === 'roof') && chain.length > 0;
      if (drawing && tgt.id !== 'typed-length') {
        // Typing a length while drawing: handled here so no key is lost before the length box has focus.
        if (/^[0-9.'"\-/ a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          typedRef.current += e.key;
          setTyped(typedRef.current);
          return;
        }
        if (e.key === 'Backspace' && typedRef.current) {
          e.preventDefault();
          typedRef.current = typedRef.current.slice(0, -1);
          setTyped(typedRef.current);
          return;
        }
        if (e.key === 'Enter' && typedRef.current) {
          e.preventDefault();
          commitTyped(typedRef.current);
          return;
        }
      }
      if (e.key === 'Enter' && (tool === 'floor' || tool === 'roof') && !typed) finishPoly();
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && tool === 'select') {
        e.preventDefault();
        apply('Delete', (d) => deleteElement(d, selectedId));
        set({ selectedId: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- Mouse ----------

  const onDown = (e: React.PointerEvent) => {
    const { sx, sy } = eventPt(e);
    const w = toW(sx, sy);
    svgRef.current?.setPointerCapture?.(e.pointerId);
    if (e.button === 1 || e.button === 2 || readOnly) {
      setDrag({ kind: 'pan', start: w, last: w, screen0: { x: sx, y: sy }, moved: false });
      return;
    }
    if (tool === 'select') {
      const sel = selectedId ? project.elements.find((x) => x.id === selectedId) : null;
      if (sel && (sel.kind === 'wall' || sel.kind === 'beam')) {
        for (const which of ['a', 'b'] as const) {
          const hp = toS(sel[which]);
          if (Math.hypot(hp.x - sx, hp.y - sy) <= 8) {
            setDrag({ kind: 'end', which, id: sel.id, start: w, last: w, screen0: { x: sx, y: sy }, moved: false });
            return;
          }
        }
      }
      const hit = hitTest(sx, sy);
      set({ selectedId: hit?.id ?? null });
      if (hit && hit.kind !== 'opening') setDrag({ kind: 'move', id: hit.id, start: w, last: w, screen0: { x: sx, y: sy }, moved: false });
      else setDrag({ kind: 'pan', start: w, last: w, screen0: { x: sx, y: sy }, moved: false });
      return;
    }
    const s = doSnap(w);
    const pt = chain.length && (tool === 'wall' || tool === 'beam' || tool === 'floor' || tool === 'roof') && s.kind === 'none' ? constrain(chain[chain.length - 1]!, s.pt) : s.pt;
    if (tool === 'wall' || tool === 'beam') placeLinePoint(pt);
    else if (tool === 'floor' || tool === 'roof') placePolyPoint(pt);
    else if (tool === 'post') {
      apply('Add post', (d) => void addPost(d, levelId, s.pt, tables, Math.max(1, tolMm)));
    } else if (tool === 'opening') {
      const hit = hitTest(sx, sy);
      if (hit?.kind !== 'wall') return setMsg('Click on a wall to place an opening.');
      const t = nearestOnSegment(w, hit.a, hit.b).t;
      set({ selectedId: hit.id });
      window.dispatchEvent(new CustomEvent('spanwise:new-opening', { detail: { wallId: hit.id, offset: Math.round(t * lengthOf(hit)) } }));
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const { sx, sy } = eventPt(e);
    const w = toW(sx, sy);
    if (drag) {
      const movedPx = Math.hypot(sx - drag.screen0.x, sy - drag.screen0.y);
      if (drag.kind === 'pan') {
        setTf({ ...view, cx: view.cx - (w.x - drag.last.x), cy: view.cy - (w.y - drag.last.y) });
        return;
      }
      if (movedPx < 3 && !drag.moved) return;
      if (drag.kind === 'move' && drag.id) {
        const s = doSnap(w, [drag.id]);
        const dx = s.pt.x - drag.start.x;
        const dy = s.pt.y - drag.start.y;
        setPreview(applyPreview(project, (d) => moveElement(d, drag.id!, dx, dy, tables)));
        setSnap(s);
        setDrag({ ...drag, last: s.pt, moved: true });
      } else if (drag.kind === 'end' && drag.id) {
        const s = doSnap(w, [drag.id]);
        setPreview(applyPreview(project, (d) => moveEndpoint(d, drag.id!, drag.which!, s.pt, tables)));
        setSnap(s);
        setDrag({ ...drag, last: s.pt, moved: true });
      }
      return;
    }
    setCursor(w);
    if (tool !== 'select') setSnap(doSnap(w));
    else setSnap(null);
  };

  const onUp = () => {
    if (drag?.moved && drag.id) {
      const { id, start, last, which } = drag;
      if (drag.kind === 'move') apply('Move', (d) => moveElement(d, id, last.x - start.x, last.y - start.y, tables));
      if (drag.kind === 'end') apply('Move end point', (d) => moveEndpoint(d, id, which!, last, tables));
    }
    setDrag(null);
    setPreview(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    const { sx, sy } = eventPt(e);
    const before = toW(sx, sy);
    const scale = Math.min(2, Math.max(0.005, view.scale * Math.exp(-e.deltaY * 0.0015)));
    const after = { x: (sx - size.W / 2) / scale + view.cx, y: (size.H / 2 - sy) / scale + view.cy };
    setTf({ scale, cx: view.cx + (before.x - after.x), cy: view.cy + (before.y - after.y) });
  };

  // ---------- Drawing ----------

  const gridLines = useMemo(() => {
    let g = project.defaults.grid;
    while (g * view.scale < 12) g *= 2;
    const tl = toW(0, 0);
    const br = toW(size.W, size.H);
    const lines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    for (let x = Math.floor(tl.x / g) * g; x <= br.x; x += g) {
      const s = toS({ x, y: 0 });
      lines.push({ x1: s.x, y1: 0, x2: s.x, y2: size.H, major: Math.abs(x % (g * 5)) < 1e-6 });
    }
    for (let y = Math.floor(br.y / g) * g; y <= tl.y; y += g) {
      const s = toS({ x: 0, y });
      lines.push({ x1: 0, y1: s.y, x2: size.W, y2: s.y, major: Math.abs(y % (g * 5)) < 1e-6 });
    }
    return lines;
  }, [view, size, project.defaults.grid, toS, toW]);

  const poly = (pts: Pt[]) => pts.map((p) => `${toS(p).x},${toS(p).y}`).join(' ');
  const rectFor = (a: Pt, b: Pt, width: number) => {
    const o1 = offsetSegment(a, b, width / 2);
    const o2 = offsetSegment(a, b, -width / 2);
    return poly([o1.a, o1.b, o2.b, o2.a]);
  };

  const renderEl = (e: Element, ghostMode: boolean) => {
    const sel = e.id === selectedId && !ghostMode;
    const col = ghostMode ? 'var(--ghost)' : COLORS[e.lifecycle];
    const common = { 'data-id': ghostMode ? undefined : e.id, 'data-kind': e.kind } as Record<string, string | undefined>;
    if (e.kind === 'surface') {
      const c = e.polygon.reduce((s, q) => ({ x: s.x + q.x / e.polygon.length, y: s.y + q.y / e.polygon.length }), { x: 0, y: 0 });
      const arrowA = toS(polar(c, -600, e.spanDirection));
      const arrowB = toS(polar(c, 600, e.spanDirection));
      return (
        <g key={e.id} {...common}>
          <polygon points={poly(e.polygon)} className={`surf ${e.role} ${sel ? 'sel' : ''}`} />
          {!ghostMode && (
            <>
              <line x1={arrowA.x} y1={arrowA.y} x2={arrowB.x} y2={arrowB.y} className="span-arrow" markerEnd="url(#arrow)" markerStart="url(#arrow)" />
              <text x={toS(c).x} y={toS(c).y - 8} className="lbl" textAnchor="middle">
                {e.label} {e.role === 'roof' ? `roof ${e.pitch ?? 0}°` : 'floor'}
                {e.joistSize ? ` · ${e.joistSize}@${e.joistSpacing ?? '?'}` : ''}
              </text>
            </>
          )}
        </g>
      );
    }
    if (e.kind === 'wall') {
      const m = toS({ x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 });
      return (
        <g key={e.id} {...common}>
          <polygon points={rectFor(e.a, e.b, e.thickness)} fill={col} className={`wall ${e.bearing ? 'bearing' : ''} ${e.lifecycle} ${sel ? 'sel' : ''}`} />
          {!ghostMode && (
            <text x={m.x} y={m.y - 6} className="lbl" textAnchor="middle">
              {e.label}
              {e.bearing ? ' (B)' : ''} {(lengthOf(e) / 1000).toFixed(3)}
            </text>
          )}
        </g>
      );
    }
    if (e.kind === 'beam') {
      const wdt = e.section.plies * tables.plyThickness;
      const m = toS({ x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 });
      return (
        <g key={e.id} {...common}>
          <polygon points={rectFor(e.a, e.b, Math.max(wdt, 2 / view.scale))} className={`beam ${e.role} ${sel ? 'sel' : ''}`} stroke={col} />
          {!ghostMode && (
            <text x={m.x} y={m.y + 14} className="lbl beamlbl" textAnchor="middle">
              {e.label} {e.section.plies}-{e.section.size}
            </text>
          )}
        </g>
      );
    }
    if (e.kind === 'post') {
      const b = (e.section.plies * tables.plyThickness) / 2;
      const d = (tables.depths[e.section.size] ?? 140) / 2;
      const s = toS(e.at);
      const hw = Math.max(4, b * view.scale);
      const hh = Math.max(4, d * view.scale);
      return (
        <g key={e.id} {...common}>
          <rect x={s.x - hw} y={s.y - hh} width={2 * hw} height={2 * hh} className={`post ${sel ? 'sel' : ''}`} fill={col} />
          {!ghostMode && (
            <text x={s.x + hw + 3} y={s.y - hh} className="lbl">
              {e.label}
            </text>
          )}
        </g>
      );
    }
    if (e.kind === 'opening') {
      const wall = shown.elements.find((x): x is Wall => x.id === e.wallId);
      if (!wall) return null;
      const { s, e: en } = openingEnds(wall, e);
      return (
        <g key={e.id} {...common}>
          <polygon points={rectFor(s, en, wall.thickness + 2 / view.scale)} className={`opening ${sel ? 'sel' : ''}`} />
          {!ghostMode && (
            <text x={toS(s).x} y={toS(s).y + 14} className="lbl">
              {e.label} {(e.width / 1000).toFixed(3)}
            </text>
          )}
        </g>
      );
    }
    return null;
  };

  const order = (e: Element) => ({ surface: 0, wall: 1, opening: 2, beam: 3, post: 4 })[e.kind];
  const sortedEls = [...els].sort((a, b) => order(a) - order(b));

  const last = chain[chain.length - 1];
  const rubberEnd = last && cursor ? (snap && snap.kind !== 'none' ? snap.pt : constrain(last, cursor)) : null;
  const typedParse = typed ? parseLength(typed, project.defaults.bareUnit) : null;
  const selEl = selectedId ? shown.elements.find((x) => x.id === selectedId) : null;
  const hint: Record<Tool, string> = {
    select: 'Click to select. Drag to move. Drag an end point to stretch. Drag empty space to pan; scroll to zoom. Delete removes.',
    wall: 'Click the start, then click or type a length and press Enter. Walls chain; Esc ends.',
    beam: 'Click the start, then click or type a length and press Enter.',
    post: 'Click to place a post. It links to the beam above it automatically.',
    floor: 'Click corners; click the first corner or press Enter to close. You can type lengths.',
    roof: 'Click corners; click the first corner or press Enter to close. Set pitch and ridge in the panel.',
    opening: 'Click a wall where the opening goes. Then set its offset and width in the panel.',
  };

  return (
    <div className="plan-wrap">
      <svg
        ref={svgRef}
        className={`plan tool-${tool}`}
        width={size.W}
        height={size.H}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="plan"
        data-scale={view.scale}
        data-cx={view.cx}
        data-cy={view.cy}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="arrowhead" />
          </marker>
        </defs>
        <rect x={0} y={0} width={size.W} height={size.H} className="plan-bg" />
        {gridLines.map((l, i) => (
          <line key={i} {...l} className={l.major ? 'grid major' : 'grid'} />
        ))}
        {(() => {
          const o = toS({ x: 0, y: 0 });
          return <circle cx={o.x} cy={o.y} r={3} className="origin" />;
        })()}
        <g opacity={0.35}>{ghost.map((e) => renderEl(e, true))}</g>
        {sortedEls.map((e) => renderEl(e, false))}
        {selEl && (selEl.kind === 'wall' || selEl.kind === 'beam') && tool === 'select' && !readOnly && (
          <>
            {(['a', 'b'] as const).map((k) => (
              <circle key={k} cx={toS(selEl[k]).x} cy={toS(selEl[k]).y} r={6} className="handle" data-handle={k} />
            ))}
          </>
        )}
        {chain.length > 0 && (tool === 'floor' || tool === 'roof') && <polyline points={poly(rubberEnd ? [...chain, rubberEnd] : chain)} className="rubber" />}
        {last && rubberEnd && (tool === 'wall' || tool === 'beam') && (
          <>
            <line x1={toS(last).x} y1={toS(last).y} x2={toS(rubberEnd).x} y2={toS(rubberEnd).y} className="rubber" />
            <text x={toS(rubberEnd).x + 10} y={toS(rubberEnd).y - 10} className="lbl dim">
              {(dist(last, rubberEnd) / 1000).toFixed(3)} m @ {Math.round(angleDeg(last, rubberEnd))}°
            </text>
          </>
        )}
        {snap && snap.kind !== 'none' && (
          <rect x={toS(snap.pt).x - 5} y={toS(snap.pt).y - 5} width={10} height={10} className={`snapmark ${snap.kind}`} />
        )}
      </svg>
      <div className="plan-status small">
        <span>{hint[tool]}</span>
        {cursor && (
          <span className="muted">
            x = {(cursor.x / 1000).toFixed(3)} m, y = {(cursor.y / 1000).toFixed(3)} m{snap && snap.kind !== 'none' ? ` · snap: ${snap.kind}` : ''}
          </span>
        )}
      </div>
      {chain.length > 0 && tool !== 'select' && tool !== 'post' && tool !== 'opening' && (
        <div className="typed">
          <label className="f" htmlFor="typed-length">
            Length (Enter to place)
            <input
              id="typed-length"
              data-testid="typed-length"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitTyped(e.currentTarget.value);
                }
                if (e.key === 'Escape') setTyped('');
              }}
              placeholder="e.g. 8000, 8m, 26'-3&quot;"
            />
          </label>
          {typedParse && (
            <span className={`preview ${typedParse.ok ? '' : 'bad'}`} data-testid="typed-preview">
              {typedParse.ok ? typedParse.explain : typedParse.error}
            </span>
          )}
        </div>
      )}
      {msg && <div className="error small">{msg}</div>}
    </div>
  );
}

function applyPreview(p: Project, fn: (d: Project) => void): Project {
  const copy = JSON.parse(JSON.stringify(p)) as Project;
  fn(copy);
  return copy;
}
