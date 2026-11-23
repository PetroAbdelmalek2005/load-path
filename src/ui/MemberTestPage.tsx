import { useMemo, useState } from 'react';
import { buildCodeValues, projectDefaults } from '../model/codeValues';
import { blankLoad, formToInput, PRESETS, type LoadRow, type MemberForm, type SupportRow } from '../model/memberForm';
import { runMember, type CaseRef, type CheckResult, type MemberResult } from '../engine/runMember';
import { checkPost, type PostResult } from '../engine/checks/column';
import type { Traced } from '../engine/trace';
import { Diagram } from './Diagram';

const cv = buildCodeValues();
const defaults = projectDefaults();
const settings = { cantileverDeflectionMultiplier: defaults.cantileverDeflectionMultiplier, defaultBearingLength: defaults.defaultBearingLength, maxSpans: defaults.maxSpans };
const SPECIES = Object.keys(cv.strengths.value);
const SIZES = Object.keys(cv.depths.value);

export const DISCLAIMER = 'Not for construction until reviewed and sealed by a licensed engineer.';

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const num = (s: string): number => (s.trim() === '' ? NaN : Number(s));
const optNum = (s: string): number | null => (s.trim() === '' ? null : Number(s));
const ratioClass = (r: number) => (r < 0.8 ? 'g' : r <= 1.0 ? 'a' : 'r');

function caseText(c: CaseRef): string {
  const parts = [c.combination];
  if (c.liveSpans.length) parts.push(`live on span${c.liveSpans.length > 1 ? 's' : ''} ${c.liveSpans.join(', ')}`);
  if (c.snowSpans.length) parts.push(`snow on span${c.snowSpans.length > 1 ? 's' : ''} ${c.snowSpans.join(', ')}`);
  return parts.join(', ');
}

function Unverified({ keys }: { keys: string[] }) {
  if (!keys.length) return null;
  return (
    <span className="badge unv" title={`Depends on unverified code values:\n${keys.join('\n')}`}>
      UNVERIFIED
    </span>
  );
}

function TraceBlock({ t }: { t: Traced }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div>
        <strong>{t.label}</strong> = {fmt(t.value, 3)} {t.units} <span className="muted small">({t.clause})</span>
      </div>
      <code className="formula">{t.formula}</code>
      {t.inputs.length > 0 && (
        <div className="table-wrap">
          <table className="small">
            <tbody>
              {t.inputs.map((i) => (
                <tr key={i.symbol}>
                  <td>{i.symbol}</td>
                  <td className="num">{typeof i.value === 'number' ? +i.value.toFixed(4) : i.value}</td>
                  <td>{i.units}</td>
                  <td className="muted">
                    {i.codeKey ?? ''} {i.verified === false && <span className="badge unv">UNVERIFIED</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CheckCard({ c }: { c: CheckResult }) {
  const st = c.status;
  return (
    <details className="check-d">
      <summary>
        <strong>{c.label}</strong>
        {c.ratio !== null && <span className={`ratio ${ratioClass(c.ratio)}`}>{fmt(c.ratio, 3)}</span>}
        <span className={`badge ${st === 'pass' ? 'pass' : st === 'fail' ? 'fail' : 'refused'}`}>{st.toUpperCase()}</span>
        <Unverified keys={c.unverified} />
        {c.governing && (
          <span className="muted small">
            {caseText(c.governing)}
            {c.governing.x !== undefined ? ` · x = ${fmt(c.governing.x, 3)} m` : ''}
          </span>
        )}
      </summary>
      <div>
        {c.message && <p className="warn">{c.message}</p>}
        {c.demand && <TraceBlock t={c.demand} />}
        {c.resistance && <TraceBlock t={c.resistance} />}
        {c.extra?.map((t) => <TraceBlock key={t.label} t={t} />)}
        {c.kd && (
          <div style={{ marginTop: 8 }}>
            <strong>KD = {fmt(c.kd.KD, 4)}</strong>{' '}
            <span className="muted small">(lower of the two; used: {c.kd.used === 'effect' ? 'load effect' : 'total load'})</span>
            <code className="formula">
              From load effect: PL = {fmt(c.kd.fromEffect.PL, 3)}, PS = {fmt(c.kd.fromEffect.PS, 3)} → KD = {fmt(c.kd.fromEffect.KD, 4)} · {c.kd.fromEffect.formula}
            </code>
            <code className="formula">
              From total load: PL = {fmt(c.kd.fromTotal.PL, 3)} kN, PS = {fmt(c.kd.fromTotal.PS, 3)} kN → KD = {fmt(c.kd.fromTotal.KD, 4)} · {c.kd.fromTotal.formula}
            </code>
          </div>
        )}
      </div>
    </details>
  );
}

function SupportsEditor({ form, set }: { form: MemberForm; set: (f: MemberForm) => void }) {
  const upd = (i: number, p: Partial<SupportRow>) => set({ ...form, supports: form.supports.map((s, k) => (k === i ? { ...s, ...p } : s)) });
  return (
    <>
      {form.supports.map((s, i) => (
        <div className="grid4" key={i} style={{ marginBottom: 6 }}>
          <label className="f">
            Name
            <input value={s.id} onChange={(e) => upd(i, { id: e.target.value })} />
          </label>
          <label className="f">
            x (m)
            <input type="number" step="0.01" value={Number.isNaN(s.x) ? '' : s.x} onChange={(e) => upd(i, { x: num(e.target.value) })} />
          </label>
          <label className="f">
            Type
            <select value={s.type} onChange={(e) => upd(i, { type: e.target.value as SupportRow['type'] })}>
              <option value="pin">pin</option>
              <option value="roller">roller</option>
              <option value="fixed">fixed</option>
            </select>
          </label>
          <label className="f">
            Bearing lb (mm)
            <span style={{ display: 'flex', gap: 4 }}>
              <input type="number" placeholder={`${defaults.defaultBearingLength} (assumed)`} value={s.bearingLength ?? ''} onChange={(e) => upd(i, { bearingLength: optNum(e.target.value) })} />
              <button className="x" title="Remove support" onClick={() => set({ ...form, supports: form.supports.filter((_, k) => k !== i) })}>
                ×
              </button>
            </span>
          </label>
        </div>
      ))}
      <button onClick={() => set({ ...form, supports: [...form.supports, { id: String.fromCharCode(65 + form.supports.length), x: form.length, type: 'roller', bearingLength: null }] })}>+ Support</button>
    </>
  );
}

function LoadEditor({ form, set }: { form: MemberForm; set: (f: MemberForm) => void }) {
  const upd = (i: number, p: Partial<LoadRow>) => set({ ...form, loads: form.loads.map((l, k) => (k === i ? { ...l, ...p } : l)) });
  const n = (i: number, key: keyof LoadRow, label: string, step = '0.01') => (
    <label className="f">
      {label}
      <input type="number" step={step} value={Number.isNaN(form.loads[i]![key] as number) ? '' : (form.loads[i]![key] as number)} onChange={(e) => upd(i, { [key]: num(e.target.value) })} />
    </label>
  );
  return (
    <>
      {form.loads.map((l, i) => (
        <div className="row" key={l.id}>
          <div className="head">
            <span className={`tag ${l.pattern}`}>{l.pattern}</span>
            <select value={l.pattern} onChange={(e) => upd(i, { pattern: e.target.value as LoadRow['pattern'] })} style={{ width: 'auto' }}>
              <option value="D">Dead</option>
              <option value="L">Live</option>
              <option value="S">Snow (before Is)</option>
            </select>
            <select value={l.shape} onChange={(e) => upd(i, { shape: e.target.value as LoadRow['shape'] })} style={{ width: 'auto' }}>
              <option value="area">Area strip (kPa × width)</option>
              <option value="line">Line (uniform, partial, trapezoid)</option>
              <option value="point">Point force</option>
              <option value="moment">Point moment</option>
            </select>
            <button className="x" title="Remove load" onClick={() => set({ ...form, loads: form.loads.filter((_, k) => k !== i) })}>
              ×
            </button>
          </div>
          <div className="grid2" style={{ marginBottom: 6 }}>
            <label className="f">
              Label
              <input value={l.label} onChange={(e) => upd(i, { label: e.target.value })} />
            </label>
            <label className="f">
              Status
              <select value={l.status} onChange={(e) => upd(i, { status: e.target.value as LoadRow['status'] })}>
                <option value="assumed">assumed</option>
                <option value="verified">verified</option>
              </select>
            </label>
          </div>
          {l.shape === 'area' && (
            <div className="grid4">
              {n(i, 'q', 'q (kPa)')}
              {n(i, 'trib', 'width (m)')}
              {n(i, 'x1', 'x1 (m)')}
              {n(i, 'x2', 'x2 (m)')}
            </div>
          )}
          {l.shape === 'line' && (
            <div className="grid4">
              {n(i, 'w1', 'w1 (kN/m)')}
              {n(i, 'x1', 'at x1 (m)')}
              {n(i, 'w2', 'w2 (kN/m)')}
              {n(i, 'x2', 'to x2 (m)')}
            </div>
          )}
          {l.shape === 'point' && (
            <div className="grid2">
              {n(i, 'P', 'P (kN, down +)')}
              {n(i, 'x', 'x (m)')}
            </div>
          )}
          {l.shape === 'moment' && (
            <div className="grid2">
              {n(i, 'M', 'M (kN·m, CCW +)')}
              {n(i, 'x', 'x (m)')}
            </div>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(['D', 'L', 'S'] as const).map((p) => (
          <button key={p} onClick={() => set({ ...form, loads: [...form.loads, blankLoad(p, form.length)] })}>
            + {p === 'D' ? 'Dead' : p === 'L' ? 'Live' : 'Snow'} load
          </button>
        ))}
      </div>
    </>
  );
}

function Results({ res, form, ms }: { res: MemberResult; form: MemberForm; ms: number }) {
  const [diag, setDiag] = useState<string>('envelope');
  const [defl, setDefl] = useState(0);
  const d = res.diagrams;
  const supX = form.supports.map((s) => s.x);
  const vSeries =
    diag === 'envelope'
      ? [
          { label: 'max', values: d.envelope.Vmax, color: 'var(--env)' },
          { label: 'min', values: d.envelope.Vmin, color: 'var(--live)', dashed: true },
        ]
      : [{ label: diag, values: d.combinations.find((c) => c.name === diag)!.V, color: 'var(--env)' }];
  const mSeries =
    diag === 'envelope'
      ? [
          { label: 'max', values: d.envelope.Mmax, color: 'var(--env)' },
          { label: 'min', values: d.envelope.Mmin, color: 'var(--live)', dashed: true },
        ]
      : [{ label: diag, values: d.combinations.find((c) => c.name === diag)!.M, color: 'var(--env)' }];
  const dd = d.deflection[defl]!;
  const all: CheckResult[] = [res.checks.bending, res.checks.shear, ...res.checks.bearing, ...res.checks.deflectionLiveSnow, ...res.checks.deflectionTotal];
  const worst = all.reduce((w, c) => (c.ratio !== null && c.ratio > (w?.ratio ?? -1) ? c : w), null as CheckResult | null);

  return (
    <>
      <section className="panel">
        <h2>Summary</h2>
        {res.uplift.map((u) => (
          <div className="flag" key={u.supportId}>
            Uplift: anchorage required at support {u.supportId} (x = {u.x} m): {fmt(u.force)} kN under {caseText(u.at)}. Added to open items.
          </div>
        ))}
        {worst && (
          <p>
            Governing: <strong>{worst.label}</strong> at ratio{' '}
            <span className={`ratio ${ratioClass(worst.ratio!)}`}>{fmt(worst.ratio!, 3)}</span>.
          </p>
        )}
        <p className="small muted">
          {res.caseCount} load cases run in {ms < 1 ? '<1' : Math.round(ms)} ms: every combination × every on/off span pattern ({res.segments.length} span segment
          {res.segments.length > 1 ? 's' : ''}; live and snow patterns vary independently).
        </p>
        <p className="small">
          {res.equilibrium.every((e) => e.ok) ? (
            <span className="ok">✓ Equilibrium: applied loads equal reactions for D, L and S (within 0.01 %).</span>
          ) : (
            <span className="badge fail">EQUILIBRIUM FAILED — do not use these results</span>
          )}
        </p>
        {res.warnings.map((w) => (
          <div className="warn" key={w}>
            {w}
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>Checks</h2>
        <p className="muted small">Click a check to see its formula, inputs, clause, KD and governing case.</p>
        {all.map((c) => (
          <CheckCard key={c.id} c={c} />
        ))}
      </section>

      <section className="panel">
        <h2>Diagrams</h2>
        <div className="tabs">
          <button className={diag === 'envelope' ? 'on' : ''} onClick={() => setDiag('envelope')}>
            Envelope (all cases)
          </button>
          {d.combinations.map((c) => (
            <button key={c.name} className={diag === c.name ? 'on' : ''} onClick={() => setDiag(c.name)}>
              {c.name}
            </button>
          ))}
        </div>
        <p className="muted small">Factored. A single combination shows all spans loaded. Moment is drawn on the tension side (sagging below the axis).</p>
        <Diagram title="Shear V" units="kN" x={d.x} series={vSeries} supports={supX} length={form.length} />
        <Diagram title="Moment M" units="kN·m" x={d.x} series={mSeries} supports={supX} length={form.length} positiveDown />
        <div className="tabs" style={{ marginTop: 10 }}>
          {d.deflection.map((s, i) => (
            <button key={s.name} className={defl === i ? 'on' : ''} onClick={() => setDefl(i)}>
              {s.name}
            </button>
          ))}
        </div>
        <Diagram
          title="Deflection Δ (specified, down +)"
          units="mm"
          x={d.xNodes}
          series={[
            { label: 'all spans loaded', values: dd.allLoaded, color: 'var(--env)' },
            { label: 'envelope max', values: dd.max, color: 'var(--live)', dashed: true },
            { label: 'envelope min', values: dd.min, color: 'var(--snow)', dashed: true },
          ]}
          supports={supX}
          length={form.length}
          positiveDown
        />
      </section>

      <section className="panel">
        <h2>Reactions</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Support</th>
                <th className="num">D (kN)</th>
                <th className="num">L (kN)</th>
                <th className="num">S (kN)</th>
                <th className="num">Factored max (kN)</th>
                <th className="num">Factored min (kN)</th>
                <th>Bearing lb</th>
              </tr>
            </thead>
            <tbody>
              {res.reactions.map((r) => (
                <tr key={r.supportId}>
                  <td>
                    {r.supportId} <span className="muted small">x = {r.x} m, {r.type}</span>
                  </td>
                  <td className="num">{fmt(r.D, 3)}</td>
                  <td className="num">{fmt(r.L, 3)}</td>
                  <td className="num">{fmt(r.S, 3)}</td>
                  <td className="num" title={caseText(r.factoredMax.at)}>
                    {fmt(r.factoredMax.value, 3)}
                  </td>
                  <td className="num" title={caseText(r.factoredMin.at)} style={r.factoredMin.value < 0 ? { color: 'var(--fail)', fontWeight: 700 } : undefined}>
                    {fmt(r.factoredMin.value, 3)}
                  </td>
                  <td>
                    {r.bearingLength} mm {r.bearingLengthStatus === 'assumed' && <span className="badge assumed">ASSUMED</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          D, L and S are unfactored with all spans loaded; S includes Is (ULS). Reactions pass down unfactored, by pattern. Upward positive. Hover a factored value to see its case.
        </p>
      </section>

      <section className="panel">
        <h2>Open items</h2>
        {res.uplift.length === 0 && res.assumed.length === 0 && form.loads.every((l) => l.status === 'verified') ? (
          <p className="muted">None.</p>
        ) : (
          <ul>
            {res.uplift.map((u) => (
              <li key={u.supportId}>
                <strong>Uplift at {u.supportId}</strong>: {fmt(u.force)} kN. Anchorage required. A report cannot be marked final until the engineer acknowledges this.
              </li>
            ))}
            {res.assumed.map((a) => (
              <li key={a}>
                <span className="badge assumed">ASSUMED</span> {a}
              </li>
            ))}
            {form.loads
              .filter((l) => l.status === 'assumed')
              .map((l) => (
                <li key={l.id}>
                  <span className="badge assumed">ASSUMED</span> Load "{l.label || l.shape}" ({l.pattern})
                </li>
              ))}
          </ul>
        )}
        <h3>Unverified code values used ({res.unverified.length})</h3>
        <p className="small muted">{res.unverified.join(' · ')}</p>
      </section>
    </>
  );
}

function PostPanel({ res }: { res: MemberResult | null }) {
  const [p, setP] = useState({ species: 'SPF No.1/No.2', size: '2x6', plies: 3, height: 2.4, Ke: defaults.postKe, D: 10, L: 20, S: 0, selfWeight: true });
  const out: PostResult | string = useMemo(() => {
    try {
      return checkPost({ section: { species: p.species, size: p.size, plies: p.plies }, height: p.height, Ke: p.Ke, loads: { D: p.D, L: p.L, S: p.S }, includeSelfWeight: p.selfWeight, wetOrExterior: false }, cv);
    } catch (e) {
      return (e as Error).message;
    }
  }, [p]);
  const n = (k: 'height' | 'Ke' | 'D' | 'L' | 'S' | 'plies', label: string) => (
    <label className="f">
      {label}
      <input type="number" step="0.01" value={Number.isNaN(p[k]) ? '' : p[k]} onChange={(e) => setP({ ...p, [k]: num(e.target.value) })} />
    </label>
  );
  return (
    <section className="panel">
      <h2>Post check (axial)</h2>
      <div className="grid3">
        <label className="f">
          Species and grade
          <select value={p.species} onChange={(e) => setP({ ...p, species: e.target.value })}>
            {SPECIES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="f">
          Size
          <select value={p.size} onChange={(e) => setP({ ...p, size: e.target.value })}>
            {SIZES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {n('plies', 'Plies (1–4)')}
        {n('height', 'Height (m)')}
        {n('Ke', 'Ke')}
        <label className="check" style={{ alignSelf: 'end' }}>
          <input type="checkbox" checked={p.selfWeight} onChange={(e) => setP({ ...p, selfWeight: e.target.checked })} /> Self-weight
        </label>
        {n('D', 'D from above (kN)')}
        {n('L', 'L from above (kN)')}
        {n('S', 'S before Is (kN)')}
      </div>
      {res && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="muted small" style={{ alignSelf: 'center' }}>
            Use beam reaction:
          </span>
          {res.reactions.map((r) => (
            <button key={r.supportId} onClick={() => setP({ ...p, D: +r.D.toFixed(3), L: +r.L.toFixed(3), S: +(r.S / cv.IsULS.value).toFixed(3) })}>
              {r.supportId}
            </button>
          ))}
        </div>
      )}
      {typeof out === 'string' ? (
        <p className="error">{out}</p>
      ) : (
        <div style={{ marginTop: 10 }}>
          <p>
            <span className={`ratio ${ratioClass(out.governing.ratio)}`}>{fmt(out.governing.ratio, 3)}</span>{' '}
            <span className={`badge ${out.status}`}>{out.status.toUpperCase()}</span> <Unverified keys={out.unverified} /> <span className="muted small">governing: {out.governing.combination.name}</span>
          </p>
          <p className="small">
            Pf = {fmt(out.governing.Pf, 2)} kN · Pr = {fmt(out.governing.Pr, 2)} kN (solid {fmt(out.governing.PrSolid, 2)} kN × built-up factor {out.builtUpFactor}) · KD = {fmt(out.governing.kd.KD, 4)} · self-weight {fmt(out.selfWeight, 3)} kN
          </p>
          <p className="small">
            Thin axis: Cc = {fmt(out.governing.resistance.thin.Cc)}, KZc = {fmt(out.governing.resistance.thin.KZc, 3)}, KC = {fmt(out.governing.resistance.thin.KC, 4)}, Pr = {fmt(out.governing.resistance.thin.Pr)} kN · Wide axis: Cc ={' '}
            {fmt(out.governing.resistance.wide.Cc)}, Pr = {fmt(out.governing.resistance.wide.Pr)} kN
          </p>
          {out.warnings.map((w) => (
            <div className="warn" key={w}>
              {w}
            </div>
          ))}
          <TraceBlock t={out.resistance} />
        </div>
      )}
      <p className="muted small">The built-up factor is a placeholder until you verify CSA O86 6.5.6.4.</p>
    </section>
  );
}

export function MemberTestPage() {
  const [form, setForm] = useState<MemberForm>(PRESETS[0]!.form());
  const { result, ms } = useMemo((): { result: MemberResult | string; ms: number } => {
    const t0 = performance.now();
    try {
      const r = runMember(formToInput(form, settings), cv);
      return { result: r, ms: performance.now() - t0 };
    } catch (e) {
      return { result: (e as Error).message, ms: 0 };
    }
  }, [form]);
  const n = (k: 'length' | 'plies' | 'KSfb' | 'KSfv' | 'KSfcp' | 'KSE' | 'KT', label: string, optional = false) => (
    <label className="f">
      {label}
      <input
        type="number"
        step="0.01"
        placeholder={optional ? 'code value' : ''}
        value={form[k] === null || Number.isNaN(form[k] as number) ? '' : (form[k] as number)}
        onChange={(e) => setForm({ ...form, [k]: optional ? optNum(e.target.value) : num(e.target.value) })}
      />
    </label>
  );

  return (
    <>
      <div className="banner">{DISCLAIMER}</div>
      <header className="top">
        <div>
          <h1>Spanwise · single member test page</h1>
          <span className="sub">Milestone 1 engine check. Sawn lumber, CSA O86. All code values are unverified until the engineer confirms them.</span>
        </div>
        <label className="f" style={{ minWidth: 260 }}>
          Load an example
          <select
            value=""
            onChange={(e) => {
              const p = PRESETS.find((x) => x.key === e.target.value);
              if (p) setForm(p.form());
            }}
          >
            <option value="">Choose…</option>
            {PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      </header>
      <main>
        <div>
          <section className="panel">
            <h2>Member</h2>
            <div className="grid2">
              {n('length', 'Length (m)')}
              <label className="f">
                Species and grade
                <select value={form.species} onChange={(e) => setForm({ ...form, species: e.target.value })}>
                  {SPECIES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="f">
                Size
                <select value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })}>
                  {SIZES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              {n('plies', 'Plies (1–4)')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
              <label className="check">
                <input type="checkbox" checked={form.braced} onChange={(e) => setForm({ ...form, braced: e.target.checked })} /> Compression edge braced (KL = 1.0)
              </label>
              <label className="check">
                <input type="checkbox" checked={form.selfWeight} onChange={(e) => setForm({ ...form, selfWeight: e.target.checked })} /> Include self-weight
              </label>
              <label className="check">
                <input type="checkbox" checked={form.wetOrExterior} onChange={(e) => setForm({ ...form, wetOrExterior: e.target.checked })} /> Wet service or exterior
              </label>
            </div>
            <details style={{ marginTop: 8 }}>
              <summary className="small">Advanced: service and treatment factors (blank = code value)</summary>
              <div className="grid3" style={{ marginTop: 6 }}>
                {n('KSfb', 'KSb', true)}
                {n('KSfv', 'KSv', true)}
                {n('KSfcp', 'KScp', true)}
                {n('KSE', 'KSE', true)}
                {n('KT', 'KT', true)}
              </div>
            </details>
          </section>
          <section className="panel">
            <h2>Supports</h2>
            <SupportsEditor form={form} set={setForm} />
          </section>
          <section className="panel">
            <h2>Loads</h2>
            <p className="muted small">Specified (unfactored). Down is positive. Snow is entered before the importance factor Is.</p>
            <LoadEditor form={form} set={setForm} />
          </section>
        </div>
        <div>
          {typeof result === 'string' ? (
            <section className="panel">
              <h2>Cannot run</h2>
              <p className="error">{result}</p>
            </section>
          ) : (
            <Results res={result} form={form} ms={ms} />
          )}
          <PostPanel res={typeof result === 'string' ? null : result} />
          <p className="muted small" style={{ textAlign: 'center' }}>
            {DISCLAIMER}
          </p>
        </div>
      </main>
    </>
  );
}

