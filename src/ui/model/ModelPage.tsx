import { useEffect, useState } from 'react';
import { tables, useActiveLevelId, useModel, useUI, type Tool } from '../state';
import { copyLevel, openItems } from '../../model/edits';
import { floorToFloor, sortedLevels } from '../../model/geometry';
import { PlanView } from './PlanView';
import { PropertiesPanel } from './PropertiesPanel';
import { Viewer3D } from './Viewer3D';
import { FileActions } from '../project/ProjectPage';


const TOOLS: { key: Tool; label: string; key2: string }[] = [
  { key: 'select', label: 'Select', key2: 'V' },
  { key: 'wall', label: 'Wall', key2: 'W' },
  { key: 'beam', label: 'Beam', key2: 'B' },
  { key: 'post', label: 'Post', key2: 'P' },
  { key: 'opening', label: 'Opening', key2: 'O' },
  { key: 'floor', label: 'Floor surface', key2: 'F' },
  { key: 'roof', label: 'Roof surface', key2: 'R' },
];

function useReadOnly(): boolean {
  const q = () => typeof window !== 'undefined' && (window.matchMedia('(max-width: 899px)').matches || window.matchMedia('(pointer: coarse)').matches);
  const [ro, setRo] = useState(q);
  useEffect(() => {
    const on = () => setRo(q());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return ro;
}

export function ModelPage() {
  const project = useModel((s) => s.project);
  const gate = useModel((s) => s.gate);
  const { past, future, undo, redo, confirm, apply } = useModel((s) => s);
  const ui = useUI();
  const levelId = useActiveLevelId();
  const readOnly = useReadOnly();
  const [confirming, setConfirming] = useState(false);
  const levels = sortedLevels(project).reverse();
  const items = openItems(project, gate);

  useEffect(() => {
    if (readOnly) ui.set({ tool: 'select' });
  }, [readOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') || e.ctrlKey || e.metaKey || e.altKey || readOnly) return;
      const tool = TOOLS.find((x) => x.key2.toLowerCase() === e.key.toLowerCase());
      if (tool && ui.tool !== tool.key && !(['wall', 'beam', 'floor', 'roof'].includes(ui.tool) && document.getElementById('typed-length'))) ui.set({ tool: tool.key });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <main className="model">
      <div className="model-bar">
        <label className="f inline">
          Level
          <select data-testid="level-select" value={levelId} onChange={(e) => ui.set({ levelId: e.target.value, selectedId: null })}>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({(l.elevation / 1000).toFixed(3)} m)
              </option>
            ))}
          </select>
        </label>
        {!readOnly && (
          <>
            <button onClick={() => apply('Copy level up', (d) => void copyLevel(d, levelId, 'above', tables))}>Copy level up</button>
            <button onClick={() => apply('Copy level down', (d) => void copyLevel(d, levelId, 'below', tables))}>Copy level down</button>
          </>
        )}
        <div className="seg" role="tablist">
          <button className={ui.view === 'plan' ? 'on' : ''} onClick={() => ui.set({ view: 'plan' })} data-testid="view-plan">
            Plan
          </button>
          <button className={ui.view === '3d' ? 'on' : ''} onClick={() => ui.set({ view: '3d' })} data-testid="view-3d">
            3D
          </button>
        </div>
        {!readOnly && (
          <>
            <button onClick={undo} disabled={!past.length} title="Ctrl+Z">
              Undo
            </button>
            <button onClick={redo} disabled={!future.length} title="Ctrl+Y">
              Redo
            </button>
          </>
        )}
        <span className="spacer" />
        {gate === 'confirmed' ? (
          <span className="badge pass" data-testid="gate">
            MODEL CONFIRMED
          </span>
        ) : confirming ? (
          <span className="confirm-box">
            <span className="small">I have checked the geometry, supports and statuses.</span>
            <button
              className="primary"
              data-testid="confirm-yes"
              onClick={() => {
                confirm();
                setConfirming(false);
              }}
            >
              Confirm model
            </button>
            <button onClick={() => setConfirming(false)}>Cancel</button>
          </span>
        ) : (
          <>
            <span className="badge assumed" data-testid="gate">
              MODEL UNCONFIRMED
            </span>
            {!readOnly && (
              <button className="primary" data-testid="confirm" onClick={() => setConfirming(true)}>
                Confirm model…
              </button>
            )}
          </>
        )}
      </div>
      {readOnly && <div className="notice small">View only on this screen size. Drawing works on a desktop or laptop.</div>}

      <div className={`model-grid ${readOnly ? 'ro' : ''}`}>
        {!readOnly && (
          <div className="tools" role="toolbar" aria-label="Drawing tools">
            {TOOLS.map((t) => (
              <button key={t.key} className={ui.tool === t.key ? 'on' : ''} onClick={() => ui.set({ tool: t.key })} title={`${t.label} (${t.key2})`} data-testid={`tool-${t.key}`}>
                {t.label}
                <span className="kbd">{t.key2}</span>
              </button>
            ))}
            <hr />
            <label className="check small">
              <input type="checkbox" checked={ui.ortho} onChange={(e) => ui.set({ ortho: e.target.checked })} /> Ortho (90°)
            </label>
            {ui.tool === 'wall' && (
              <label className="f small">
                Draw walls by
                <select value={ui.wallRef} onChange={(e) => ui.set({ wallRef: e.target.value as typeof ui.wallRef })}>
                  <option value="centre">Centreline</option>
                  <option value="left">Face on the left (wall offset right)</option>
                  <option value="right">Face on the right (wall offset left)</option>
                </select>
              </label>
            )}
            <p className="muted small">New elements: {project.defaults.mode}, assumed.</p>
          </div>
        )}
        <div className="canvas">
          {ui.view === 'plan' ? (
            <PlanView readOnly={readOnly} />
          ) : (
            <>
              <div className="levels-toggle small">
                {levels.map((l) => (
                  <label key={l.id} className="check">
                    <input
                      type="checkbox"
                      checked={!ui.hiddenLevels.includes(l.id)}
                      onChange={(e) => ui.set({ hiddenLevels: e.target.checked ? ui.hiddenLevels.filter((x) => x !== l.id) : [...ui.hiddenLevels, l.id] })}
                    />
                    {l.name}
                  </label>
                ))}
              </div>
              <Viewer3D />
            </>
          )}
        </div>
        <aside className="side">
          <PropertiesPanel readOnly={readOnly} />
          <section className="panel">
            <h2>Open items ({items.length})</h2>
            <ul className="small items" data-testid="open-items">
              {items.slice(0, 40).map((x) => (
                <li key={x}>{x}</li>
              ))}
              {items.length > 40 && <li>…and {items.length - 40} more.</li>}
            </ul>
          </section>
          <section className="panel">
            <h2>History</h2>
            {past.length === 0 && <p className="muted small">No changes yet.</p>}
            <ol className="small history" data-testid="history">
              {past.slice(-15).map((h, i) => (
                <li key={i}>{h.label}</li>
              ))}
            </ol>
            {future.length > 0 && <p className="muted small">{future.length} undone change(s) can be redone.</p>}
          </section>
          <section className="panel small">
            <h2>Level</h2>
            {(() => {
              const l = project.levels.find((x) => x.id === levelId)!;
              return (
                <p>
                  {l.name}: elevation {(l.elevation / 1000).toFixed(3)} m, wall height {(l.wallHeight / 1000).toFixed(3)} m, floor depth {(l.floorDepth / 1000).toFixed(3)} m, floor-to-floor{' '}
                  {(floorToFloor(l) / 1000).toFixed(3)} m. Edit in Project.
                </p>
              );
            })()}
          </section>
          {!readOnly && <FileActions />}
        </aside>
      </div>
    </main>
  );
}
