import { useEffect, useState } from 'react';
import { tables, useModel, useUI } from '../state';
import { addOpening, sectionLabel, updateElement } from '../../model/edits';
import { angleDeg, beamTop, beamsThrough, dist, floorJoistDepth, lengthOf, levelOf, polar, polygonArea, postGeometry } from '../../model/geometry';
import type { Beam, Element, Opening, Post, Project, SectionRef, Surface, Wall } from '../../model/types';
import { LengthField } from './LengthField';
import { buildCodeValues } from '../../model/codeValues';
import { newId as formId, type MemberForm } from '../../model/memberForm';

const cv = buildCodeValues();
const SPECIES = Object.keys(cv.strengths.value);
const SIZES = Object.keys(tables.depths);
const m3 = (mm: number) => `${(mm / 1000).toFixed(3)} m`;

function SectionEdit({ value, onChange, label }: { value: SectionRef; onChange: (s: SectionRef) => void; label: string }) {
  return (
    <label className="f">
      {label}
      <span className="lenrow">
        <select aria-label={`${label} plies`} value={value.plies} onChange={(e) => onChange({ ...value, plies: Number(e.target.value) })}>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}-ply
            </option>
          ))}
        </select>
        <select aria-label={`${label} size`} value={value.size} onChange={(e) => onChange({ ...value, size: e.target.value })}>
          {SIZES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select aria-label={`${label} species`} value={value.species} onChange={(e) => onChange({ ...value, species: e.target.value })}>
          {SPECIES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </span>
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="kv">
      <span className="muted">{k}</span>
      <span>{v}</span>
    </div>
  );
}

/** Builds an Engine test form from a beam: span and section only. */
export function beamToForm(b: Beam): MemberForm {
  const L = Math.round(lengthOf(b)) / 1000;
  return {
    name: `${b.label} from model`,
    length: L,
    species: b.section.species,
    size: b.section.size,
    plies: b.section.plies,
    braced: true,
    wetOrExterior: false,
    selfWeight: true,
    KSfb: null,
    KSfv: null,
    KSfcp: null,
    KSE: null,
    KT: null,
    supports: [
      { id: 'A', x: 0, type: 'pin', bearingLength: b.bearingA },
      { id: 'B', x: L, type: 'roller', bearingLength: b.bearingB },
    ],
    loads: [],
  };
}

function NewOpeningForm({ wallId, offset, onDone }: { wallId: string; offset: number; onDone: () => void }) {
  const project = useModel((s) => s.project);
  const apply = useModel((s) => s.apply);
  const wall = project.elements.find((e): e is Wall => e.id === wallId && e.kind === 'wall');
  const [off, setOff] = useState<number>(offset);
  const [width, setWidth] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setOff(offset), [offset]);
  if (!wall) return null;
  const bu = project.defaults.bareUnit;
  return (
    <section className="panel" data-testid="new-opening">
      <h2>New opening in {wall.label}</h2>
      <p className="muted small">Wall length {m3(lengthOf(wall))}. Offset is measured from the wall's start point.</p>
      <LengthField label="Offset from wall start" value={off} bareUnit={bu} onCommit={(v) => v !== null && setOff(v)} testId="op-offset" />
      <LengthField label="Width" value={width} bareUnit={bu} onCommit={(v) => setWidth(v)} testId="op-width" />
      <p className="muted small">A header is created automatically ({sectionLabel(project.defaults.headerSection)}, one jack stud each end), marked assumed.</p>
      <div className="btnrow">
        <button
          className="primary"
          disabled={width === null}
          onClick={() => {
            try {
              apply('Add opening', (d) => void addOpening(d, wallId, off, width!, tables));
              setErr(null);
              onDone();
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          Add opening
        </button>
        <button onClick={onDone}>Cancel</button>
      </div>
      {err && <p className="error small">{err}</p>}
    </section>
  );
}

export function PropertiesPanel({ readOnly }: { readOnly: boolean }) {
  const project = useModel((s) => s.project);
  const apply = useModel((s) => s.apply);
  const { selectedId, set } = useUI();
  const [newOpening, setNewOpening] = useState<{ wallId: string; offset: number } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setNewOpening((e as CustomEvent).detail);
    window.addEventListener('spanwise:new-opening', on);
    return () => window.removeEventListener('spanwise:new-opening', on);
  }, []);

  const el = selectedId ? project.elements.find((e) => e.id === selectedId) : null;
  const bu = project.defaults.bareUnit;
  const upd = (patch: Partial<Element>, geometry = true, label = 'Edit') => apply(label, (d) => updateElement(d, el!.id, patch, tables), { geometry });

  return (
    <>
      {newOpening && !readOnly && <NewOpeningForm wallId={newOpening.wallId} offset={newOpening.offset} onDone={() => setNewOpening(null)} />}
      {!el ? (
        <section className="panel">
          <h2>Properties</h2>
          <p className="muted">Select an element in the plan or the 3D view.</p>
        </section>
      ) : (
        <section className="panel member-panel" data-testid="member-panel">
          <h2>
            {el.label} <span className="muted small">{el.kind === 'beam' ? el.role : el.kind}</span>{' '}
            <span className={`badge ${el.status === 'verified' ? 'pass' : 'assumed'}`}>{el.status.toUpperCase()}</span>
          </h2>
          <fieldset disabled={readOnly} className="plain">
            <div className="grid2">
              <label className="f">
                Label
                <input value={el.label} onChange={(e) => upd({ label: e.target.value }, false, 'Rename')} />
              </label>
              <label className="f">
                Existing / new / remove
                <select value={el.lifecycle} onChange={(e) => upd({ lifecycle: e.target.value as Element['lifecycle'] }, true, 'Change status')}>
                  <option value="existing">Existing</option>
                  <option value="new">New</option>
                  <option value="remove">To remove</option>
                </select>
              </label>
            </div>
            <Row k="Level" v={levelOf(project, el.levelId).name} />
            <KindFields el={el} project={project} upd={upd} bu={bu} />
            <label className="f" style={{ marginTop: 8 }}>
              Notes
              <textarea rows={2} value={el.notes} onChange={(e) => upd({ notes: e.target.value }, false, 'Edit notes')} />
            </label>
            <div className="btnrow" style={{ marginTop: 8 }}>
              {el.status === 'assumed' ? (
                <button onClick={() => upd({ status: 'verified' }, false, `Verify ${el.label}`)}>Mark verified</button>
              ) : (
                <button onClick={() => upd({ status: 'assumed' }, false, `Unverify ${el.label}`)}>Mark assumed</button>
              )}
              {el.kind === 'beam' && (
                <button
                  data-testid="send-to-engine"
                  onClick={() => {
                    set({ engineSeed: { ...beamToForm(el), name: `${el.label} from model ${formId('')}` } });
                    location.hash = '#engine';
                  }}
                >
                  Send to Engine test
                </button>
              )}
            </div>
          </fieldset>
        </section>
      )}
    </>
  );
}

function KindFields({ el, project, upd, bu }: { el: Element; project: Project; upd: (p: Partial<Element>, g?: boolean, l?: string) => void; bu: Project['defaults']['bareUnit'] }) {
  switch (el.kind) {
    case 'wall':
      return <WallFields w={el} upd={upd} bu={bu} />;
    case 'beam':
      return <BeamFields b={el} project={project} upd={upd} bu={bu} />;
    case 'post':
      return <PostFields p={el} project={project} upd={upd} />;
    case 'surface':
      return <SurfaceFields s={el} upd={upd} bu={bu} />;
    case 'opening':
      return <OpeningFields o={el} project={project} upd={upd} bu={bu} />;
  }
}

function WallFields({ w, upd, bu }: { w: Wall; upd: (p: Partial<Wall>, g?: boolean, l?: string) => void; bu: Project['defaults']['bareUnit'] }) {
  const ang = angleDeg(w.a, w.b);
  return (
    <>
      <div className="grid2">
        <LengthField label="Length" value={lengthOf(w)} bareUnit={bu} onCommit={(v) => v !== null && v > 0 && upd({ b: polar(w.a, v, Math.abs(ang - Math.round(ang / 90) * 90) < 1e-9 ? Math.round(ang / 90) * 90 : ang) }, true, 'Wall length')} />
        <LengthField label="Thickness" value={w.thickness} bareUnit={bu} onCommit={(v) => v !== null && upd({ thickness: v })} />
        <LengthField label="Height" value={w.height} bareUnit={bu} onCommit={(v) => v !== null && upd({ height: v })} />
        <LengthField label="Stud spacing" value={w.studSpacing} bareUnit={bu} onCommit={(v) => v !== null && upd({ studSpacing: v })} />
        <label className="f">
          Stud size
          <select value={w.studSize} onChange={(e) => upd({ studSize: e.target.value })}>
            {SIZES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="f">
          Plates
          <input type="number" min={1} max={4} value={w.plates} onChange={(e) => upd({ plates: Math.max(1, Math.round(Number(e.target.value) || 3)) })} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={w.bearing} onChange={(e) => upd({ bearing: e.target.checked }, true, 'Bearing flag')} /> Bearing wall (your choice)
      </label>
      <Row k="Start / end" v={`(${m3(w.a.x)}, ${m3(w.a.y)}) → (${m3(w.b.x)}, ${m3(w.b.y)})`} />
    </>
  );
}

function BeamFields({ b, project, upd, bu }: { b: Beam; project: Project; upd: (p: Partial<Beam>, g?: boolean, l?: string) => void; bu: Project['defaults']['bareUnit'] }) {
  const lvl = levelOf(project, b.levelId);
  const mid = { x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 };
  const jd = floorJoistDepth(project, b.levelId, mid, tables);
  const top = beamTop(project, b, tables);
  const ang = angleDeg(b.a, b.b);
  return (
    <>
      <div className="grid2">
        <label className="f">
          Role
          <select value={b.role} onChange={(e) => upd({ role: e.target.value as Beam['role'] }, false)}>
            <option value="beam">Beam</option>
            <option value="girder">Girder</option>
            <option value="header">Header</option>
          </select>
        </label>
        <LengthField label="Length" value={lengthOf(b)} bareUnit={bu} onCommit={(v) => v !== null && v > 0 && upd({ b: polar(b.a, v, Math.abs(ang - Math.round(ang / 90) * 90) < 1e-9 ? Math.round(ang / 90) * 90 : ang) }, true, 'Beam length')} />
      </div>
      <SectionEdit label="Section" value={b.section} onChange={(s) => upd({ section: s }, true, 'Beam section')} />
      <div className="grid2">
        <label className="f">
          Top-of-beam elevation
          <select value={b.elevationMode} onChange={(e) => upd({ elevationMode: e.target.value as Beam['elevationMode'], topElevation: top }, true, 'Beam elevation')}>
            <option value="flush" disabled={jd === null}>
              Flush (top = joist top){jd === null ? ' — needs floor joist size' : ''}
            </option>
            <option value="dropped">Dropped (top = joist underside)</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <LengthField label="Top of beam" value={top} bareUnit={bu} disabled={b.elevationMode !== 'custom'} onCommit={(v) => v !== null && upd({ topElevation: v }, true, 'Beam elevation')} />
        <LengthField label="Bearing at start" value={b.bearingA} allowEmpty bareUnit={bu} onCommit={(v) => upd({ bearingA: v })} />
        <LengthField label="Bearing at end" value={b.bearingB} allowEmpty bareUnit={bu} onCommit={(v) => upd({ bearingB: v })} />
      </div>
      <Row k="Relative to" v={`${lvl.name} floor (elevation ${m3(lvl.elevation)}, floor depth ${lvl.floorDepth} mm${jd !== null ? `, joists ${jd} mm` : ''})`} />
      <Row k="Span (end to end)" v={m3(lengthOf(b))} />
    </>
  );
}

function PostFields({ p, project, upd }: { p: Post; project: Project; upd: (x: Partial<Post>, g?: boolean, l?: string) => void }) {
  const g = postGeometry(project, p, tables);
  const through = beamsThrough(project, p.at, 1, tables).filter((b) => b.id !== p.baseId);
  const walls = project.elements.filter((e): e is Wall => e.kind === 'wall' && dist(p.at, nearestOnWall(e, p.at)) <= e.thickness / 2 + 1);
  return (
    <>
      <SectionEdit label="Section" value={p.section} onChange={(s) => upd({ section: s }, true, 'Post section')} />
      <div className="grid2">
        <label className="f">
          Stands on
          <select value={p.baseId ?? ''} onChange={(e) => upd({ baseId: e.target.value || null }, true, 'Post base')}>
            <option value="">Floor of {levelOf(project, p.levelId).name}</option>
            {walls.map((w) => (
              <option key={w.id} value={w.id}>
                Wall {w.label} ({levelOf(project, w.levelId).name})
              </option>
            ))}
            {beamsThrough(project, p.at, 1, tables).map((b) => (
              <option key={b.id} value={b.id}>
                Beam {b.label} ({levelOf(project, b.levelId).name})
              </option>
            ))}
          </select>
        </label>
        <label className="f">
          Supports
          <select value={p.supportsId ?? ''} onChange={(e) => upd({ supportsId: e.target.value || null }, true, 'Post top')}>
            <option value="">No beam linked</option>
            {through.map((b) => (
              <option key={b.id} value={b.id}>
                Beam {b.label} ({levelOf(project, b.levelId).name})
              </option>
            ))}
          </select>
        </label>
      </div>
      <Row k="Base" v={`${m3(g.base)} (${g.baseFrom})`} />
      <Row k="Top" v={`${m3(g.top)} (${g.topFrom})`} />
      <div className="kv" data-testid="post-length">
        <span className="muted">Length (calculated)</span>
        <strong>{m3(g.length)}</strong>
      </div>
      {g.length <= 0 && <p className="error small">The post has no length. Check what it stands on and what it supports.</p>}
      <Row k="Location" v={`(${m3(p.at.x)}, ${m3(p.at.y)})`} />
    </>
  );
}

function nearestOnWall(w: Wall, p: { x: number; y: number }) {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const L2 = dx * dx + dy * dy || 1;
  const t = Math.min(1, Math.max(0, ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / L2));
  return { x: w.a.x + t * dx, y: w.a.y + t * dy };
}

function SurfaceFields({ s, upd, bu }: { s: Surface; upd: (x: Partial<Surface>, g?: boolean, l?: string) => void; bu: Project['defaults']['bareUnit'] }) {
  return (
    <>
      <div className="grid2">
        <label className="f">
          Type
          <select value={s.role} onChange={(e) => upd({ role: e.target.value as Surface['role'], pitch: e.target.value === 'roof' ? (s.pitch ?? 0) : null, ridgeDirection: e.target.value === 'roof' ? (s.ridgeDirection ?? 0) : null })}>
            <option value="floor">Floor</option>
            <option value="roof">Roof</option>
          </select>
        </label>
        <label className="f">
          Span direction (° from east)
          <input type="number" value={s.spanDirection} onChange={(e) => upd({ spanDirection: Number(e.target.value) || 0 })} />
        </label>
        <label className="f">
          Joist size (optional)
          <select value={s.joistSize ?? ''} onChange={(e) => upd({ joistSize: e.target.value || null })}>
            <option value="">Not set</option>
            {SIZES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <LengthField label="Joist spacing (optional)" value={s.joistSpacing} allowEmpty bareUnit={bu} onCommit={(v) => upd({ joistSpacing: v })} />
        {s.role === 'roof' && (
          <>
            <label className="f">
              Pitch (°)
              <input type="number" value={s.pitch ?? 0} onChange={(e) => upd({ pitch: Number(e.target.value) || 0 })} />
            </label>
            <label className="f">
              Ridge direction (° from east)
              <input type="number" value={s.ridgeDirection ?? 0} onChange={(e) => upd({ ridgeDirection: Number(e.target.value) || 0 })} />
            </label>
          </>
        )}
      </div>
      <Row k="Area (plan)" v={`${(polygonArea(s.polygon) / 1e6).toFixed(2)} m²`} />
      <p className="muted small">Loads on surfaces arrive in Milestone 3. Rafters and the gable template too.</p>
    </>
  );
}

function OpeningFields({ o, project, upd, bu }: { o: Opening; project: Project; upd: (x: Partial<Opening>, g?: boolean, l?: string) => void; bu: Project['defaults']['bareUnit'] }) {
  const wall = project.elements.find((e): e is Wall => e.id === o.wallId);
  const header = project.elements.find((e): e is Beam => e.id === o.headerId);
  return (
    <>
      <div className="grid2">
        <LengthField label="Offset from wall start" value={o.offset} bareUnit={bu} onCommit={(v) => v !== null && upd({ offset: v })} />
        <LengthField label="Width" value={o.width} bareUnit={bu} onCommit={(v) => v !== null && v > 0 && upd({ width: v })} />
        <LengthField label="Height" value={o.height} bareUnit={bu} onCommit={(v) => v !== null && upd({ height: v })} />
        <LengthField label="Sill" value={o.sill} bareUnit={bu} onCommit={(v) => v !== null && upd({ sill: v })} />
      </div>
      <Row k="Wall" v={wall ? `${wall.label} (${m3(lengthOf(wall))})` : 'missing'} />
      <Row k="Header" v={header ? `${header.label}: ${sectionLabel(header.section)}, ${header.status}` : 'none (deleted)'} />
    </>
  );
}
