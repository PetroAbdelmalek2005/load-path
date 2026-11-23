// Acceptance tests A to L and N from docs/ACCEPTANCE_TESTS.md. Tolerance 0.5 % unless stated.
import { describe, expect, it } from 'vitest';
import { runMember } from '../../src/engine/runMember';
import { buildMesh, solveLoadSet } from '../../src/engine/solver/beam';
import { columnResistance } from '../../src/engine/checks/column';
import { kdFrom } from '../../src/engine/checks/loadDuration';
import { sectionProps } from '../../src/engine/sections';
import { Uses } from '../../src/engine/trace';
import { discontinuities } from '../../src/engine/loads';
import type { MemberLoad, Support } from '../../src/engine/types';
import { cv, member, moment, near, point, sup, udl } from '../helpers';

const EI = 1000; // kN·m², arbitrary for closed-form shape tests

function solve(length: number, supports: Support[], loads: MemberLoad[], ei = EI) {
  const mesh = buildMesh(length, supports, discontinuities(loads), ei);
  return { mesh, r: solveLoadSet(mesh, loads) };
}
function maxAbs(a: ArrayLike<number>) {
  let best = 0;
  let idx = 0;
  for (let i = 0; i < a.length; i++)
    if (Math.abs(a[i]!) > Math.abs(best)) {
      best = a[i]!;
      idx = i;
    }
  return { v: best, i: idx };
}
function maxM(r: ReturnType<typeof solveLoadSet>) {
  let best = -Infinity;
  let i0 = 0;
  for (let i = 0; i < r.MR.length; i++) {
    if (r.MR[i]! > best) {
      best = r.MR[i]!;
      i0 = i;
    }
    if (r.ML[i]! > best) {
      best = r.ML[i]!;
      i0 = i;
    }
  }
  return { v: best, i: i0 };
}
const comboDiagram = (res: ReturnType<typeof runMember>, name: string) => res.diagrams.combinations.find((c) => c.name === name)!;

describe('Shared section (A, B, D)', () => {
  it('S, I and self-weight', () => {
    const s = sectionProps({ species: 'SPF No.1/No.2', size: '2x10', plies: 3 }, cv, new Uses());
    expect(s.b).toBe(114);
    expect(s.d).toBe(235);
    near(s.S, 1_049_275);
    near(s.I, 123.29e6);
    near(s.selfWeight, 0.134);
    expect(s.KZ).toBe(1.1);
  });
});

describe('Test A — simple span 4.0 m, D 0.6 kPa × 4 m, L 1.9 kPa × 4 m', () => {
  const res = runMember(member(4, [sup('A', 0), sup('B', 4, 'roller')], [udl('D', 2.4, 0, 4), udl('L', 7.6, 0, 4)]), cv);
  it('1.25D + 1.5L: Mf = 29.135 kN·m, Vf = 29.135 kN', () => {
    const d = comboDiagram(res, '1.25D + 1.5L + 1.0S');
    near(Math.max(...d.M), 29.135);
    near(Math.max(...d.V.map(Math.abs)), 29.135);
    expect(res.checks.bending.governing!.combination).toBe('1.25D + 1.5L + 1.0S');
    near(res.checks.bending.demand!.value, 29.135);
  });
  it('Mr = 12.258 kN·m at KD = 1.0, Vr = 26.522 kN', () => {
    expect(res.checks.bending.kd!.KD).toBe(1.0);
    near(res.checks.bending.resistance!.value, 12.258);
    expect(res.checks.shear.kd!.KD).toBe(1.0);
    near(res.checks.shear.resistance!.value, 26.522);
  });
  it('1.4D: Mf = 7.095 kN·m, KD = 0.65, Mr = 7.967 kN·m', () => {
    const d = comboDiagram(res, '1.4D');
    near(Math.max(...d.M), 7.095);
    // Dead load only member: 1.4D governs bending with KD = 0.65.
    const deadOnly = runMember(member(4, [sup('A', 0), sup('B', 4, 'roller')], [udl('D', 2.4, 0, 4)]), cv);
    expect(deadOnly.checks.bending.governing!.combination).toBe('1.4D');
    near(deadOnly.checks.bending.demand!.value, 7.095);
    expect(deadOnly.checks.bending.kd!.KD).toBe(0.65);
    near(deadOnly.checks.bending.resistance!.value, 7.967);
  });
  it('Live load deflection = 21.63 mm', () => {
    near(res.checks.deflectionLiveSnow[0]!.demand!.value, 21.63);
  });
});

describe('Test B — 3.6 m, D area + line + point, L area', () => {
  const res = runMember(
    member(3.6, [sup('A', 0), sup('B', 3.6, 'roller')], [udl('D', 1.5, 0, 3.6), udl('L', 4.75, 0, 3.6), udl('D', 1.0, 0, 3.6), point('D', 5.0, 1.8)]),
    cv,
  );
  it('1.25D + 1.5L: Mf = 22.50 kN·m, Vf = 21.88 kN', () => {
    const d = comboDiagram(res, '1.25D + 1.5L + 1.0S');
    near(Math.max(...d.M), 22.5);
    near(Math.max(...d.V.map(Math.abs)), 21.88);
  });
  it('Total specified deflection (D + L) = 17.9 mm', () => {
    near(res.checks.deflectionTotal[0]!.demand!.value, 17.9);
  });
  it('Specified dead reaction at each end = 7.24 kN', () => {
    near(res.reactions[0]!.D, 7.24);
    near(res.reactions[1]!.D, 7.24);
  });
});

describe('Test C — 10 kN at midspan of 4.0 m', () => {
  it('M = 10.0 kN·m and Δ = PL³/48EI', () => {
    const { r } = solve(4, [sup('A', 0), sup('B', 4, 'roller')], [point('D', 10, 2)]);
    near(maxM(r).v, 10);
    near(maxAbs(r.defl).v, ((10 * 4 ** 3) / (48 * EI)) * 1000);
  });
});

describe('Test D — KD for dead-dominant 1.25D + 1.5L', () => {
  it('KD = 1 − 0.5·log10(6.134/1.9) = 0.7455', () => {
    near(kdFrom(6.134, 1.9, false, cv, new Uses()).KD, 0.7455, 0.001);
    const res = runMember(member(4, [sup('A', 0), sup('B', 4, 'roller')], [udl('D', 6.0, 0, 4), udl('L', 1.9, 0, 4)]), cv);
    expect(res.checks.bending.governing!.combination).toBe('1.25D + 1.5L + 1.0S');
    near(res.checks.bending.kd!.KD, 0.7455, 0.001);
    near(res.checks.bending.kd!.fromTotal.KD, 0.7455, 0.001);
  });
});

describe('Test E — 3-ply 2x6 post, Le = 2.4 m, Fc = 11.5 MPa', () => {
  const c = columnResistance(114, 140, 2400, 11.5, 6500, 1, 1, cv, new Uses());
  it('thin axis: Cc = 21.05, KZc = 1.237, KC = 0.6315, Pr = 114.7 kN', () => {
    near(c.thin.Cc, 21.05);
    near(c.thin.KZc, 1.237);
    near(c.thin.KC, 0.6315);
    near(c.thin.Pr, 114.7);
  });
  it('wide axis: Cc = 17.14, Pr = 135.4 kN', () => {
    near(c.wide.Cc, 17.14);
    near(c.wide.Pr, 135.4);
    expect(c.governing.axis).toBe('thin');
  });
});

describe('Test F — partial uniform load', () => {
  const { mesh, r } = solve(6, [sup('A', 0), sup('B', 6, 'roller')], [udl('D', 5, 0, 3)]);
  it('R1 = 11.25 kN, R2 = 3.75 kN, Mmax = 12.656 kN·m at x = 2.25 m', () => {
    near(r.reactions[0]!.V, 11.25);
    near(r.reactions[1]!.V, 3.75);
    const m = maxM(r);
    near(m.v, 12.656);
    expect(Math.abs(mesh.xs[m.i]! - 2.25)).toBeLessThan(0.031);
  });
});

describe('Test G — triangular load 0 to 6 kN/m over 6 m', () => {
  const { mesh, r } = solve(6, [sup('A', 0), sup('B', 6, 'roller')], [udl('D', 0, 0, 6, 6)]);
  it('R1 = 6, R2 = 12, Mmax = 13.856 at 3.464 m', () => {
    near(r.reactions[0]!.V, 6);
    near(r.reactions[1]!.V, 12);
    near(r.applied.F, 18);
    const m = maxM(r);
    near(m.v, 13.856);
    expect(Math.abs(mesh.xs[m.i]! - 3.464)).toBeLessThan(0.031);
  });
  it('Δmax = 0.00652·wL⁴/EI at 0.5193 L', () => {
    const d = maxAbs(r.defl);
    near(d.v, ((0.00652 * 6 * 6 ** 4) / EI) * 1000);
    expect(Math.abs(mesh.xs[d.i]! / 6 - 0.5193)).toBeLessThan(0.006);
  });
});

describe('Test H — trapezoid = uniform + triangle', () => {
  it('R1 = 8.333, R2 = 11.667', () => {
    const { r } = solve(5, [sup('A', 0), sup('B', 5, 'roller')], [udl('D', 2, 0, 5, 6)]);
    near(r.reactions[0]!.V, 8.333);
    near(r.reactions[1]!.V, 11.667);
    const sum = solve(5, [sup('A', 0), sup('B', 5, 'roller')], [udl('D', 2, 0, 5), udl('D', 0, 0, 5, 4)]).r;
    near(r.reactions[0]!.V, sum.reactions[0]!.V, 1e-9);
    near(maxM(r).v, maxM(sum).v, 1e-9);
  });
});

describe('Test I — point moment 10 kN·m at 2.0 m on 5.0 m', () => {
  const { mesh, r } = solve(5, [sup('A', 0), sup('B', 5, 'roller')], [moment('D', 10, 2)]);
  it('reactions 2.0 kN, equal and opposite', () => {
    near(Math.abs(r.reactions[0]!.V), 2);
    near(r.reactions[0]!.V, -r.reactions[1]!.V);
  });
  it('moment jumps by 10: 4.0 just left, 6.0 just right', () => {
    const i = mesh.xs.findIndex((x) => Math.abs(x - 2) < 1e-9);
    near(Math.abs(r.ML[i]!), 4);
    near(Math.abs(r.MR[i]!), 6);
    near(Math.abs(r.MR[i]! - r.ML[i]!), 10);
  });
});

describe('Test J — cantilever 2.0 m, w = 3.0 kN/m', () => {
  it('fixed-end moment 6.0, shear 6.0, tip deflection wL⁴/8EI', () => {
    const { r } = solve(2, [sup('A', 0, 'fixed')], [udl('D', 3, 0, 2)]);
    near(r.reactions[0]!.V, 6);
    near(Math.abs(r.reactions[0]!.M), 6);
    near(Math.abs(r.MR[0]!), 6);
    expect(r.MR[0]!).toBeLessThan(0); // hogging
    near(r.defl[r.defl.length - 1]!, ((3 * 2 ** 4) / (8 * EI)) * 1000);
  });
});

describe('Test K — two equal spans, both loaded', () => {
  it('reactions 3wL/8, 10wL/8, 3wL/8; M at middle support = −wL²/8', () => {
    const w = 5;
    const L = 4;
    const { mesh, r } = solve(2 * L, [sup('A', 0), sup('B', L), sup('C', 2 * L, 'roller')], [udl('D', w, 0, 2 * L)]);
    near(r.reactions[0]!.V, (3 * w * L) / 8);
    near(r.reactions[1]!.V, (10 * w * L) / 8);
    near(r.reactions[2]!.V, (3 * w * L) / 8);
    const i = mesh.xs.findIndex((x) => Math.abs(x - L) < 1e-9);
    near(r.ML[i]!, (-w * L * L) / 8);
  });
});

describe('Test L — two equal spans, live load on span 1 only (pattern)', () => {
  const w = 5;
  const L = 4;
  it('closed-form single-span loading', () => {
    const { mesh, r } = solve(2 * L, [sup('A', 0), sup('B', L), sup('C', 2 * L, 'roller')], [udl('L', w, 0, L)]);
    near(r.reactions[0]!.V, (7 * w * L) / 16);
    near(r.reactions[1]!.V, (10 * w * L) / 16);
    near(r.reactions[2]!.V, (-w * L) / 16);
    const i = mesh.xs.findIndex((x) => Math.abs(x - L) < 1e-9);
    near(r.ML[i]!, (-w * L * L) / 16);
    const m = maxM(r);
    near(m.v, (49 * w * L * L) / 512);
    expect(Math.abs(mesh.xs[m.i]! - (7 * L) / 16)).toBeLessThan(0.021);
  });
  it('pattern engine finds one-span loading as governing for positive moment', () => {
    const res = runMember(
      member(2 * L, [sup('A', 0), sup('B', L), sup('C', 2 * L, 'roller')], [udl('L', w, 0, 2 * L)], { includeSelfWeight: false }),
      cv,
    );
    const pos = res.momentExtremes.positive!;
    near(pos.value, (1.5 * 49 * w * L * L) / 512);
    expect(pos.at.liveSpans.length).toBe(1);
    // and both spans loaded governs hogging at the middle support
    const neg = res.momentExtremes.negative!;
    near(neg.value, (-1.5 * w * L * L) / 8);
    expect(neg.at.liveSpans).toEqual([1, 2]);
    // uplift at the far support from one-span loading
    expect(res.uplift.length).toBeGreaterThan(0);
  });
});

describe('Test N — equilibrium on every model', () => {
  it('passes for every acceptance model', () => {
    const models = [
      member(4, [sup('A', 0), sup('B', 4, 'roller')], [udl('D', 2.4, 0, 4), udl('L', 7.6, 0, 4)]),
      member(3.6, [sup('A', 0), sup('B', 3.6)], [udl('D', 1.5, 0, 3.6), point('D', 5, 1.8), udl('L', 4.75, 0, 3.6)]),
      member(8, [sup('A', 0), sup('B', 4), sup('C', 8)], [udl('L', 5, 0, 8), moment('D', 3, 2.5), udl('S', 1, 1, 7, 3)]),
      member(5, [sup('A', 0, 'fixed'), sup('B', 3.5)], [udl('D', 2, 0, 5), point('L', 4, 5), udl('S', 1, 0.5, 4.5)]),
    ];
    for (const m of models) {
      const res = runMember(m, cv);
      for (const e of res.equilibrium) expect(e.ok, `${e.pattern}: ${e.forceError}`).toBe(true);
    }
  });
  it('passes for 50 random models', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let k = 0; k < 50; k++) {
      const Lm = Math.round((2 + rnd() * 10) * 100) / 100;
      const nSup = 2 + Math.floor(rnd() * 3);
      const xs = new Set<number>();
      while (xs.size < nSup) xs.add(Math.round(rnd() * Lm * 100) / 100);
      const supports = [...xs].sort((a, b) => a - b).map((x, i) => sup(`S${i}`, x));
      const loads: MemberLoad[] = [];
      const pats = ['D', 'L', 'S'] as const;
      for (let j = 0; j < 6; j++) {
        const p = pats[Math.floor(rnd() * 3)]!;
        const a = Math.round(rnd() * Lm * 100) / 100;
        const b = Math.round(rnd() * Lm * 100) / 100;
        const kind = Math.floor(rnd() * 3);
        if (kind === 0 && Math.abs(a - b) > 0.05) loads.push(udl(p, rnd() * 10, Math.min(a, b), Math.max(a, b), rnd() * 10));
        else if (kind === 1) loads.push(point(p, rnd() * 20, a));
        else loads.push(moment(p, (rnd() - 0.5) * 20, a));
      }
      const res = runMember(member(Lm, supports, loads), cv);
      for (const e of res.equilibrium) expect(e.ok, `model ${k} ${e.pattern}: F ${e.forceError} M ${e.momentError} L=${Lm} sup=${JSON.stringify(supports.map(s=>s.x))} loads=${JSON.stringify(loads)} app=${e.appliedForce} R=${e.reactionForce}`).toBe(true);
    }
  }, 60_000);
});
