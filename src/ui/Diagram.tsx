import { useMemo, useRef, useState } from 'react';

export interface Series {
  label: string;
  values: number[];
  color: string;
  dashed?: boolean;
}

interface Props {
  title: string;
  units: string;
  x: number[];
  series: Series[];
  /** Plot positive values downward (moment on the tension side, deflection downward). */
  positiveDown?: boolean;
  supports?: number[];
  length: number;
  digits?: number;
}

const W = 760;
const H = 210;
const PAD = { l: 56, r: 14, t: 16, b: 26 };

export function Diagram({ title, units, x, series, positiveDown, supports = [], length, digits = 2 }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);

  const { yMin, yMax } = useMemo(() => {
    let lo = 0;
    let hi = 0;
    for (const s of series) for (const v of s.values) if (Number.isFinite(v)) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    if (hi - lo < 1e-9) {
      hi += 1;
      lo -= 1;
    }
    const pad = (hi - lo) * 0.08;
    return { yMin: lo - pad, yMax: hi + pad };
  }, [series]);

  const sx = (v: number) => PAD.l + (v / length) * (W - PAD.l - PAD.r);
  const sy = (v: number) => {
    const t = (v - yMin) / (yMax - yMin);
    return positiveDown ? PAD.t + t * (H - PAD.t - PAD.b) : H - PAD.b - t * (H - PAD.t - PAD.b);
  };
  const path = (vals: number[]) => {
    let d = '';
    for (let i = 0; i < x.length; i++) {
      const v = vals[i];
      if (v === undefined || !Number.isFinite(v)) continue;
      d += `${d ? 'L' : 'M'}${sx(x[i]!).toFixed(1)},${sy(v).toFixed(1)}`;
    }
    return d;
  };

  // Extreme labels per series
  const extremes = series.map((s) => {
    let iMax = 0;
    let iMin = 0;
    s.values.forEach((v, i) => {
      if (v > s.values[iMax]!) iMax = i;
      if (v < s.values[iMin]!) iMin = i;
    });
    return { iMax, iMin };
  });

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = ref.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const xv = ((px - PAD.l) / (W - PAD.l - PAD.r)) * length;
    if (xv < 0 || xv > length) return setHover(null);
    let best = 0;
    for (let i = 0; i < x.length; i++) if (Math.abs(x[i]! - xv) < Math.abs(x[best]! - xv)) best = i;
    setHover(best);
  };

  const ticks = 5;
  return (
    <div className="chart-wrap">
      <div className="legend">
        <strong style={{ color: 'var(--text)' }}>
          {title} ({units})
        </strong>
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      {hover !== null && (
        <div className="chart-tip">
          x = {x[hover]!.toFixed(3)} m ·{' '}
          {series.map((s) => `${s.label}: ${(s.values[hover] ?? NaN).toFixed(digits)}`).join(' · ')}
        </div>
      )}
      <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`${title} diagram`}>
        {Array.from({ length: ticks + 1 }, (_, k) => {
          const v = yMin + ((yMax - yMin) * k) / ticks;
          return (
            <g key={k}>
              <line className="axis" x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} strokeDasharray="2 4" />
              <text x={PAD.l - 6} y={sy(v) + 4} textAnchor="end">
                {v.toFixed(Math.abs(yMax - yMin) < 10 ? 2 : 1)}
              </text>
            </g>
          );
        })}
        <line className="zero" x1={PAD.l} x2={W - PAD.r} y1={sy(0)} y2={sy(0)} />
        {supports.map((s, i) => (
          <polygon key={i} points={`${sx(s)},${sy(0)} ${sx(s) - 6},${sy(0) + 10} ${sx(s) + 6},${sy(0) + 10}`} fill="var(--muted)" opacity={0.6} />
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <text key={t} x={sx(t * length)} y={H - 8} textAnchor="middle">
            {(t * length).toFixed(2)}
          </text>
        ))}
        {series.map((s) => (
          <path key={s.label} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={1.8} strokeDasharray={s.dashed ? '5 4' : undefined} />
        ))}
        {series.map((s, k) =>
          [extremes[k]!.iMax, extremes[k]!.iMin].map((i, j) => {
            const v = s.values[i];
            if (v === undefined || Math.abs(v) < 1e-6) return null;
            return (
              <text key={`${s.label}${j}`} x={sx(x[i]!)} y={sy(v) + (v > 0 === !positiveDown ? -5 : 13)} textAnchor="middle" style={{ fill: s.color, fontWeight: 700 }}>
                {v.toFixed(digits)}
              </text>
            );
          }),
        )}
        {hover !== null && <line x1={sx(x[hover]!)} x2={sx(x[hover]!)} y1={PAD.t} y2={H - PAD.b} stroke="var(--accent)" strokeWidth={1} />}
      </svg>
    </div>
  );
}
