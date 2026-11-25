import { useRef, useState } from 'react';
import { modelStore, tables, useModel, useUI } from '../state';
import { addLevel, deleteLevel, newProject } from '../../model/edits';
import { floorToFloor, sortedLevels } from '../../model/geometry';
import { parseFile, serialize } from '../../model/persist';
import type { BareUnit, DrawingDefaults, Level, ProjectInfo } from '../../model/types';
import { LengthField } from '../model/LengthField';
import { buildCodeValues } from '../../model/codeValues';

const cv = buildCodeValues();
const SPECIES = Object.keys(cv.strengths.value);
const SIZES = Object.keys(tables.depths);
const fmtM = (mm: number) => (mm / 1000).toFixed(3);

export function FileActions() {
  const project = useModel((s) => s.project);
  const gate = useModel((s) => s.gate);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState<'new' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileName = `${(project.info.name || 'project').replace(/[^\w-]+/g, '_')}.spanwise.json`;

  const download = () => {
    const blob = new Blob([serialize(project, gate)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setMsg({ ok: true, text: `Download started: ${fileName}. If nothing downloads here, use "Copy JSON".` });
  };
  const copy = async () => {
    const text = serialize(project, gate);
    try {
      await navigator.clipboard.writeText(text);
      setMsg({ ok: true, text: 'Project JSON copied. Paste it into a text file to keep it.' });
    } catch {
      const ta = document.getElementById('json-fallback') as HTMLTextAreaElement | null;
      if (ta) {
        ta.value = text;
        ta.hidden = false;
        ta.select();
      }
      setMsg({ ok: false, text: 'Copy was blocked here. The JSON is selected below: press Ctrl+C (Cmd+C on Mac).' });
    }
  };
  const open = (f: File) => {
    const r = new FileReader();
    r.onload = () => {
      const res = parseFile(String(r.result));
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      modelStore.getState().load(res.file.project, res.file.gate);
      useUI.getState().set({ selectedId: null, levelId: null });
      setMsg({ ok: true, text: `Opened ${f.name}.` });
    };
    r.onerror = () => setMsg({ ok: false, text: 'The file could not be read. Nothing was changed.' });
    r.readAsText(f);
  };
  return (
    <section className="panel">
      <h2>Project file</h2>
      <div className="btnrow">
        <button onClick={download}>Download JSON</button>
        <button onClick={() => void copy()}>Copy JSON</button>
        <button onClick={() => fileRef.current?.click()}>Open file…</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && open(e.target.files[0])} />
        {pending === 'new' ? (
          <>
            <span className="small">Start a new project? The current one is replaced (download it first if you need it).</span>
            <button
              className="danger"
              onClick={() => {
                modelStore.getState().load(newProject(), 'unconfirmed');
                useUI.getState().set({ selectedId: null, levelId: null });
                setPending(null);
              }}
            >
              Replace
            </button>
            <button onClick={() => setPending(null)}>Cancel</button>
          </>
        ) : (
          <button onClick={() => setPending('new')}>New project</button>
        )}
      </div>
      {msg && <p className={msg.ok ? 'ok small' : 'error small'} style={{ whiteSpace: 'pre-line' }}>{msg.text}</p>}
      <textarea id="json-fallback" hidden readOnly rows={6} style={{ width: '100%' }} />
      <p className="muted small">The project also saves automatically in this browser. Keep real client data off the internet until the app has a login.</p>
    </section>
  );
}

export function ProjectPage() {
  const project = useModel((s) => s.project);
  const apply = useModel((s) => s.apply);
  const info = project.info;
  const d = project.defaults;
  const setInfo = (k: keyof ProjectInfo, v: string) => apply('Edit project info', (p) => void (p.info[k] = v), { geometry: false });
  const setDef = <K extends keyof DrawingDefaults>(k: K, v: DrawingDefaults[K]) => apply('Edit drawing defaults', (p) => void (p.defaults[k] = v), { geometry: false });
  const setLevel = (id: string, patch: Partial<Level>, geometry = true) =>
    apply('Edit level', (p) => {
      const l = p.levels.find((x) => x.id === id)!;
      Object.assign(l, patch);
    }, { geometry });
  const levels = sortedLevels(project).reverse();
  const [err, setErr] = useState<string | null>(null);

  return (
    <main className="page">
      <section className="panel">
        <h2>Project</h2>
        <div className="grid3">
          {(
            [
              ['name', 'Project name'],
              ['address', 'Address'],
              ['municipality', 'Municipality'],
              ['codeEdition', 'Code edition'],
              ['engineer', 'Engineer'],
              ['occupancy', 'Occupancy'],
            ] as const
          ).map(([k, l]) => (
            <label className="f" key={k}>
              {l}
              <input id={`info-${k}`} value={info[k]} onChange={(e) => setInfo(k, e.target.value)} />
            </label>
          ))}
        </div>
        <p className="muted small">Climate data, default loads and occupancy loads arrive with Milestone 3.</p>
      </section>

      <section className="panel">
        <h2>Levels</h2>
        <p className="muted small">
          Elevation is the top of that level's subfloor; 0 = top of the ground-floor subfloor. Floor-to-floor = wall height + floor depth (calculated). All values in mm; ft-in accepted.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Elevation</th>
                <th>Wall height</th>
                <th>Floor depth</th>
                <th className="num">Floor-to-floor (m)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {levels.map((l) => (
                <tr key={l.id}>
                  <td>
                    <input value={l.name} onChange={(e) => setLevel(l.id, { name: e.target.value }, false)} aria-label="Level name" />
                  </td>
                  <td>
                    <LengthField label="" value={l.elevation} bareUnit={d.bareUnit} onCommit={(v) => v !== null && setLevel(l.id, { elevation: v })} />
                  </td>
                  <td>
                    <LengthField label="" value={l.wallHeight} bareUnit={d.bareUnit} onCommit={(v) => v !== null && setLevel(l.id, { wallHeight: v })} />
                  </td>
                  <td>
                    <LengthField label="" value={l.floorDepth} bareUnit={d.bareUnit} onCommit={(v) => v !== null && setLevel(l.id, { floorDepth: v })} />
                  </td>
                  <td className="num">{fmtM(floorToFloor(l))}</td>
                  <td>
                    <div className="btnrow">
                      <button onClick={() => apply('Add level above', (p) => void addLevel(p, l.id, 'above'))}>+ Above</button>
                      <button onClick={() => apply('Add level below', (p) => void addLevel(p, l.id, 'below'))}>+ Below</button>
                      <button
                        className="x"
                        title="Delete level and its elements"
                        onClick={() => {
                          try {
                            setErr(null);
                            apply('Delete level', (p) => deleteLevel(p, l.id));
                          } catch (e) {
                            setErr((e as Error).message);
                          }
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {err && <p className="error small">{err}</p>}
        <p className="muted small">Copy a level with its elements from the Model workspace.</p>
      </section>

      <section className="panel">
        <h2>Drawing defaults</h2>
        <div className="grid3">
          <label className="f">
            Drawing mode (sets existing or new)
            <select id="def-mode" value={d.mode} onChange={(e) => setDef('mode', e.target.value as 'existing' | 'new')}>
              <option value="existing">Existing</option>
              <option value="new">New</option>
            </select>
          </label>
          <label className="f">
            Unit of a bare number
            <select id="def-bare" value={d.bareUnit} onChange={(e) => setDef('bareUnit', e.target.value as BareUnit)}>
              <option value="mm">mm</option>
              <option value="m">m</option>
              <option value="in">inches</option>
              <option value="ft">feet</option>
            </select>
          </label>
          <label className="f">
            Snap distance (screen px)
            <input id="def-snap" type="number" min={1} value={d.snapPx} onChange={(e) => setDef('snapPx', Math.max(1, Number(e.target.value) || 10))} />
          </label>
          <LengthField label="Grid spacing" value={d.grid} bareUnit={d.bareUnit} onCommit={(v) => v !== null && v > 0 && setDef('grid', v)} />
          <label className="f">
            Stud size
            <select value={d.studSize} onChange={(e) => setDef('studSize', e.target.value)}>
              {SIZES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <LengthField label="Stud spacing" value={d.studSpacing} bareUnit={d.bareUnit} onCommit={(v) => v !== null && setDef('studSpacing', v)} />
          <label className="f">
            Plates (bottom + top)
            <input type="number" min={1} max={4} value={d.plates} onChange={(e) => setDef('plates', Math.max(1, Math.round(Number(e.target.value) || 3)))} />
          </label>
          <LengthField label="Wall thickness" value={d.wallThickness} bareUnit={d.bareUnit} onCommit={(v) => v !== null && setDef('wallThickness', v)} />
          <LengthField label="Default opening height" value={d.openingHeight} bareUnit={d.bareUnit} onCommit={(v) => v !== null && setDef('openingHeight', v)} />
          {(
            [
              ['beamSection', 'Default beam'],
              ['postSection', 'Default post'],
              ['headerSection', 'Default header'],
            ] as const
          ).map(([k, l]) => (
            <label className="f" key={k}>
              {l}
              <span className="lenrow">
                <select value={d[k].plies} onChange={(e) => setDef(k, { ...d[k], plies: Number(e.target.value) })} aria-label={`${l} plies`}>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}-ply
                    </option>
                  ))}
                </select>
                <select value={d[k].size} onChange={(e) => setDef(k, { ...d[k], size: e.target.value })} aria-label={`${l} size`}>
                  {SIZES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <select value={d[k].species} onChange={(e) => setDef(k, { ...d[k], species: e.target.value })} aria-label={`${l} species`}>
                  {SPECIES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </span>
            </label>
          ))}
        </div>
        <p className="muted small">
          Stud size 2x6, stud spacing 406 mm and wall thickness 140 mm are starting values for drawing only, marked assumed on every element. Header bearing: {d.headerBearing} mm (one jack stud).
        </p>
      </section>
      <FileActions />
      <p className="muted small" style={{ textAlign: 'center' }}>
        Sections: {tables.plyThickness} mm plies; depths from code-values.json (unverified).
      </p>
    </main>
  );
}
