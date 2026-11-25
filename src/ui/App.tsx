import { useEffect, useState } from 'react';
import { MemberTestPage, DISCLAIMER } from './MemberTestPage';
import { ProjectPage } from './project/ProjectPage';
import { ModelPage } from './model/ModelPage';
import { startAutosave, useModel, useUI } from './state';

const WORKSPACES = [
  { key: 'project', label: 'Project', ready: true },
  { key: 'model', label: 'Model', ready: true },
  { key: 'loads', label: 'Loads', ready: false, milestone: 3 },
  { key: 'analyze', label: 'Analyze', ready: false, milestone: 4 },
  { key: 'design', label: 'Design', ready: false, milestone: 5 },
  { key: 'review', label: 'Review and report', ready: false, milestone: 5 },
] as const;

function useHash(): string {
  const read = () => (typeof location !== 'undefined' ? location.hash.replace('#', '') : '') || 'model';
  const [h, setH] = useState(read);
  useEffect(() => {
    const on = () => setH(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return h;
}

export function App() {
  const route = useHash();
  const name = useModel((s) => s.project.info.name);
  const gate = useModel((s) => s.gate);
  const notice = useUI((s) => s.notice);
  const set = useUI((s) => s.set);
  const seed = useUI((s) => s.engineSeed);
  useEffect(() => void startAutosave(), []);

  const ws = WORKSPACES.find((w) => w.key === route);
  return (
    <div className="app">
      <div className="banner">{DISCLAIMER}</div>
      <nav className="topbar" aria-label="Workspaces">
        <span className="brand">Spanwise</span>
        <span className="proj muted">{name}</span>
        <div className="ws-tabs">
          {WORKSPACES.map((w) => (
            <a key={w.key} href={`#${w.key}`} className={`ws ${route === w.key ? 'on' : ''} ${w.ready ? '' : 'later'}`}>
              {w.label}
            </a>
          ))}
          <a href="#engine" className={`ws ${route === 'engine' ? 'on' : ''}`}>
            Engine test
          </a>
        </div>
        <span className={`badge ${gate === 'confirmed' ? 'pass' : 'assumed'}`} title="Model gate">
          {gate === 'confirmed' ? 'MODEL CONFIRMED' : 'MODEL UNCONFIRMED'}
        </span>
      </nav>
      {notice && (
        <div className="notice">
          {notice}{' '}
          <button className="link" onClick={() => set({ notice: null })}>
            Dismiss
          </button>
        </div>
      )}
      {route === 'project' && <ProjectPage />}
      {route === 'model' && <ModelPage />}
      {route === 'engine' && <MemberTestPage key={seed ? JSON.stringify(seed).length : 0} initial={seed ?? undefined} embedded />}
      {ws && !ws.ready && (
        <main className="placeholder">
          <section className="panel">
            <h2>{ws.label}</h2>
            <p>This workspace arrives in Milestone {'milestone' in ws ? ws.milestone : ''}.</p>
          </section>
        </main>
      )}
    </div>
  );
}
