import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { CameraControls, Line } from '@react-three/drei';
import * as THREE from 'three';
import { tables, useModel, useUI } from '../state';
import { beamTop, lengthOf, levelOf, postGeometry, sortedLevels, wallBase } from '../../model/geometry';
import type { Element, Opening, Project, Pt, Wall } from '../../model/types';

// Plan (x east, y north, mm) → three.js (x, y up, z south), metres.
const P = (p: Pt, elev: number) => new THREE.Vector3(p.x / 1000, elev / 1000, -p.y / 1000);

interface Box {
  id: string;
  center: THREE.Vector3;
  size: [number, number, number]; // along, up, across (m)
  rotY: number;
  color: string;
  kind: Element['kind'];
}

const LIFE: Record<string, string> = { existing: '#b9a68a', new: '#4f7fd9', remove: '#d9534f' };
const KIND: Record<string, string> = { beam: '#8a5a2b', header: '#a0522d', girder: '#6b3f1d', post: '#5c4a32' };

function segBox(id: string, kind: Element['kind'], a: Pt, b: Pt, from: number, to: number, width: number, color: string): Box {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return { id, kind, center: P(mid, (from + to) / 2), size: [len / 1000, (to - from) / 1000, width / 1000], rotY: Math.atan2(b.y - a.y, b.x - a.x), color };
}

/** Wall pieces around its openings: full-height piers, plus wall above and below each opening. */
function wallBoxes(p: Project, w: Wall): Box[] {
  const ops = p.elements.filter((e): e is Opening => e.kind === 'opening' && e.wallId === w.id).sort((x, y) => x.offset - y.offset);
  const L = lengthOf(w);
  const z0 = wallBase(p, w);
  const z1 = z0 + w.height;
  const at = (s: number) => ({ x: w.a.x + ((w.b.x - w.a.x) * s) / L, y: w.a.y + ((w.b.y - w.a.y) * s) / L });
  const col = LIFE[w.lifecycle]!;
  const out: Box[] = [];
  let s = 0;
  for (const o of ops) {
    if (o.offset > s) out.push(segBox(w.id, 'wall', at(s), at(o.offset), z0, z1, w.thickness, col));
    const e = o.offset + o.width;
    const top = Math.min(z1, z0 + o.sill + o.height);
    if (top < z1) out.push(segBox(w.id, 'wall', at(o.offset), at(e), top, z1, w.thickness, col));
    if (o.sill > 0) out.push(segBox(w.id, 'wall', at(o.offset), at(e), z0, z0 + o.sill, w.thickness, col));
    s = Math.max(s, e);
  }
  if (s < L) out.push(segBox(w.id, 'wall', at(s), at(L), z0, z1, w.thickness, col));
  return out;
}

function buildBoxes(p: Project, hidden: string[]): { boxes: Box[]; surfaces: { id: string; shape: THREE.Shape; z0: number; z1: number; role: string; color: string }[] } {
  const boxes: Box[] = [];
  const surfaces: { id: string; shape: THREE.Shape; z0: number; z1: number; role: string; color: string }[] = [];
  for (const e of p.elements) {
    if (hidden.includes(e.levelId)) continue;
    if (e.kind === 'wall') boxes.push(...wallBoxes(p, e));
    else if (e.kind === 'beam') {
      const top = beamTop(p, e, tables);
      const d = tables.depths[e.section.size] ?? 235;
      boxes.push(segBox(e.id, 'beam', e.a, e.b, top - d, top, e.section.plies * tables.plyThickness, e.lifecycle === 'existing' ? KIND[e.role]! : LIFE[e.lifecycle]!));
    } else if (e.kind === 'post') {
      const g = postGeometry(p, e, tables);
      const b = e.section.plies * tables.plyThickness;
      const d = tables.depths[e.section.size] ?? 140;
      boxes.push({ id: e.id, kind: 'post', center: P(e.at, (g.base + g.top) / 2), size: [b / 1000, Math.max(0.01, g.length / 1000), d / 1000], rotY: 0, color: e.lifecycle === 'existing' ? KIND.post! : LIFE[e.lifecycle]! });
    } else if (e.kind === 'surface') {
      const lvl = levelOf(p, e.levelId);
      const shape = new THREE.Shape(e.polygon.map((q) => new THREE.Vector2(q.x / 1000, q.y / 1000)));
      if (e.role === 'floor') surfaces.push({ id: e.id, shape, z0: lvl.elevation - lvl.floorDepth, z1: lvl.elevation, role: 'floor', color: '#c8b98f' });
      else surfaces.push({ id: e.id, shape, z0: lvl.elevation + lvl.wallHeight, z1: lvl.elevation + lvl.wallHeight + 20, role: 'roof', color: '#7d8fa6' });
    }
  }
  return { boxes, surfaces };
}

function Scene({ onSelect }: { onSelect: (id: string | null) => void }) {
  const project = useModel((s) => s.project);
  const { hiddenLevels, selectedId } = useUI();
  const controls = useRef<CameraControls>(null);
  const { boxes, surfaces } = useMemo(() => buildBoxes(project, hiddenLevels), [project, hiddenLevels]);

  const bbox = useMemo(() => {
    const b = new THREE.Box3();
    for (const x of boxes) {
      const r = Math.max(x.size[0], x.size[2]) / 2;
      b.expandByPoint(x.center.clone().add(new THREE.Vector3(r, x.size[1] / 2, r)));
      b.expandByPoint(x.center.clone().sub(new THREE.Vector3(r, x.size[1] / 2, r)));
    }
    for (const s of surfaces) for (const v of s.shape.getPoints()) b.expandByPoint(new THREE.Vector3(v.x, s.z1 / 1000, -v.y));
    if (b.isEmpty()) b.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(8, 3, -6));
    return b;
  }, [boxes, surfaces]);

  // Start from an angled view, then zoom to the selection or to everything. fitToSphere keeps the viewing angle.
  const first = useRef(true);
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    if (first.current) {
      first.current = false;
      void c.rotateTo(Math.PI / 4, Math.PI / 3, false);
    }
    const sel = boxes.filter((b) => b.id === selectedId);
    const target = new THREE.Box3();
    if (sel.length) {
      for (const x of sel) {
        const r = Math.max(x.size[0], x.size[2]) / 2;
        target.expandByPoint(x.center.clone().add(new THREE.Vector3(r, x.size[1] / 2, r)));
        target.expandByPoint(x.center.clone().sub(new THREE.Vector3(r, x.size[1] / 2, r)));
      }
    } else target.copy(bbox);
    const sphere = target.getBoundingSphere(new THREE.Sphere());
    sphere.radius = Math.max(sphere.radius * 1.15, 0.5);
    void c.fitToSphere(sphere, true);
  }, [selectedId, boxes, bbox]);

  // Test hook: screen position of an element's centre, for end-to-end tests.
  const { camera, size } = useThree();
  useEffect(() => {
    (window as unknown as { __spanwise3d?: (id: string) => { x: number; y: number } | null }).__spanwise3d = (id: string) => {
      const b = boxes.find((x) => x.id === id);
      if (!b) return null;
      const v = b.center.clone().project(camera);
      return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height };
    };
  }, [boxes, camera, size]);

  const fade = selectedId !== null;
  const levels = sortedLevels(project).filter((l) => !hiddenLevels.includes(l.id));
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 10]} intensity={1.1} />
      <directionalLight position={[-10, 8, -6]} intensity={0.4} />
      <CameraControls ref={controls} makeDefault />
      <gridHelper args={[60, 60, '#888888', '#cccccc']} position={[bbox.getCenter(new THREE.Vector3()).x, Math.min(sortedLevels(project)[0]!.elevation / 1000, bbox.min.y) - 0.01, bbox.getCenter(new THREE.Vector3()).z]} />
      {boxes.map((b, i) => {
        const on = b.id === selectedId;
        return (
          <mesh
            key={`${b.id}-${i}`}
            position={b.center}
            rotation={[0, b.rotY, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(b.id);
            }}
            userData={{ id: b.id }}
          >
            <boxGeometry args={b.size} />
            <meshStandardMaterial color={on ? '#f0a020' : b.color} transparent opacity={fade && !on ? 0.15 : 1} depthWrite={!fade || on} />
          </mesh>
        );
      })}
      {surfaces.map((s) => {
        const on = s.id === selectedId;
        return (
          <mesh
            key={s.id}
            position={[0, s.z0 / 1000, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(s.id);
            }}
          >
            <extrudeGeometry args={[s.shape, { depth: (s.z1 - s.z0) / 1000, bevelEnabled: false }]} />
            <meshStandardMaterial color={on ? '#f0a020' : s.color} transparent opacity={fade && !on ? 0.08 : s.role === 'roof' ? 0.35 : 0.45} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
      {levels.map((l) => (
        <Line
          key={l.id}
          points={[
            [bbox.min.x - 1, l.elevation / 1000, bbox.max.z + 1],
            [bbox.min.x - 0.2, l.elevation / 1000, bbox.max.z + 1],
          ]}
          color="#888"
          lineWidth={1}
        />
      ))}
    </>
  );
}

export function Viewer3D() {
  const set = useUI((s) => s.set);
  const bg = (typeof document !== 'undefined' && getComputedStyle(document.documentElement).getPropertyValue('--plan-bg').trim()) || '#eef1f5';
  return (
    <div className="viewer3d" data-testid="viewer3d">
      <Canvas camera={{ position: [12, 10, 12], fov: 45, near: 0.05, far: 500 }} onPointerMissed={() => set({ selectedId: null })} gl={{ preserveDrawingBuffer: true }}>
        <color attach="background" args={[bg]} />
        <Scene onSelect={(id) => set({ selectedId: id })} />
      </Canvas>
      <div className="viewer-hint small muted">Drag to orbit, right-drag to pan, scroll to zoom. Click a member to zoom to it; click empty space to see everything.</div>
    </div>
  );
}
