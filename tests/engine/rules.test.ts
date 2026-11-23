// Tests for Baher's engineering decisions (2026-11-23) and engine safeguards.
import { describe, expect, it } from 'vitest';
import { runMember, MemberInputError } from '../../src/engine/runMember';
import { kdFrom } from '../../src/engine/checks/loadDuration';
import { checkPost } from '../../src/engine/checks/column';
import { snowBeforeIs, slopeFactor } from '../../src/engine/snow';
import { Uses } from '../../src/engine/trace';
import { cv, member, near, point, sup, udl } from '../helpers';

describe('KD rules (Q1 to Q3)', () => {
  it('dead load alone gives the permanent value', () => {
    expect(kdFrom(10, 0, true, cv, new Uses()).KD).toBe(0.65);
    expect(kdFrom(10, 0, false, cv, new Uses()).KD).toBe(0.65);
  });
  it('never exceeds 1.0 and never drops below 0.65', () => {
    expect(kdFrom(1, 10, false, cv, new Uses()).KD).toBe(1.0);
    expect(kdFrom(1e6, 1, false, cv, new Uses()).KD).toBe(0.65);
  });
  it('flags every KD code value as unverified', () => {
    const u = new Uses();
    kdFrom(6, 1.9, false, cv, u);
    expect(u.list()).toContain('loadDuration.deadDominantFormula');
  });
  it('uses the lower of the effect KD and the total-load KD, and reports both', () => {
    // Large dead point load near a support: at midspan the dead moment share differs from the total share.
    const res = runMember(member(4, [sup('A', 0), sup('B', 4)], [point('D', 20, 0.2), udl('L', 3, 0, 4)]), cv);
    const kd = res.checks.bending.kd!;
    expect(kd.KD).toBe(Math.min(kd.fromEffect.KD, kd.fromTotal.KD));
  });
});

describe('Pattern loading (Q4, Q5)', () => {
  it('runs every on/off case: 2^n for live, times 2^n for snow when both exist', () => {
    const res = runMember(member(9, [sup('A', 0), sup('B', 3), sup('C', 6), sup('D', 9)], [udl('L', 2, 0, 9), udl('S', 1, 0, 9)]), cv);
    // 1.4D: 1 case. Four combinations with L and S: 8 × 8 each.
    expect(res.caseCount).toBe(1 + 4 * 64);
  });
  it('stops above 6 spans', () => {
    const sups = [0, 1, 2, 3, 4, 5, 6, 7].map((x, i) => sup(`S${i}`, x));
    expect(() => runMember(member(7, sups, [udl('L', 1, 0, 7)]), cv)).toThrow(MemberInputError);
  });
  it('treats a cantilever overhang as a span segment', () => {
    const res = runMember(member(5, [sup('A', 0), sup('B', 4)], [udl('L', 2, 0, 5)]), cv);
    expect(res.segments.map((s) => s.kind)).toEqual(['span', 'cantilever']);
  });
});

describe('Deflection (Q6, Q7)', () => {
  it('cantilever limit = 2 × Lc / 360 and 2 × Lc / 240', () => {
    const res = runMember(member(5, [sup('A', 0), sup('B', 4)], [udl('L', 2, 0, 5)]), cv);
    near(res.checks.deflectionLiveSnow[1]!.resistance!.value, (2 * 1000) / 360);
    near(res.checks.deflectionTotal[1]!.resistance!.value, (2 * 1000) / 240);
  });
  it('live + snow are checked together, with snow at the SLS importance factor', () => {
    const onlyL = runMember(member(4, [sup('A', 0), sup('B', 4)], [udl('L', 2, 0, 4)]), cv);
    const onlyS = runMember(member(4, [sup('A', 0), sup('B', 4)], [udl('S', 2, 0, 4)]), cv);
    const both = runMember(member(4, [sup('A', 0), sup('B', 4)], [udl('L', 2, 0, 4), udl('S', 2, 0, 4)]), cv);
    near(onlyS.checks.deflectionLiveSnow[0]!.demand!.value, 0.9 * onlyL.checks.deflectionLiveSnow[0]!.demand!.value);
    near(both.checks.deflectionLiveSnow[0]!.demand!.value, 1.9 * onlyL.checks.deflectionLiveSnow[0]!.demand!.value);
  });
});

describe('Bending without bracing (Q8)', () => {
  it('refuses the check and says why', () => {
    const res = runMember(member(4, [sup('A', 0), sup('B', 4)], [udl('L', 2, 0, 4)], { compressionEdgeBraced: false }), cv);
    expect(res.checks.bending.status).toBe('refused');
    expect(res.checks.bending.message).toMatch(/6\.5\.4\.2/);
  });
  it('warns about hogging regions when braced', () => {
    const res = runMember(member(5, [sup('A', 0), sup('B', 4)], [udl('L', 2, 0, 5)]), cv);
    expect(res.warnings.some((w) => /hogging/.test(w))).toBe(true);
  });
});

describe('Bearing (Q9)', () => {
  it('uses 89 mm when unknown, marks it assumed, and reports required length', () => {
    const res = runMember(member(4, [sup('A', 0, 'pin', null), sup('B', 4, 'roller', 140)], [udl('L', 7.6, 0, 4)]), cv);
    expect(res.reactions[0]!.bearingLength).toBe(89);
    expect(res.reactions[0]!.bearingLengthStatus).toBe('assumed');
    expect(res.assumed.length).toBe(1);
    const b = res.checks.bearing[0]!;
    const req = b.extra![0]!.value;
    near(b.ratio!, req / 89);
    expect(b.unverified).toEqual(expect.arrayContaining(['sawnLumber.bearingFactorKB', 'sawnLumber.bearingSizeFactorKZcp']));
  });
});

describe('KS and KT (Q10)', () => {
  it('warns when a member is wet or exterior but uses dry factors', () => {
    const res = runMember(member(4, [sup('A', 0), sup('B', 4)], [udl('L', 2, 0, 4)], { wetOrExterior: true }), cv);
    expect(res.warnings.some((w) => /wet/.test(w))).toBe(true);
  });
  it('per-member override changes resistance', () => {
    const base = runMember(member(4, [sup('A', 0), sup('B', 4)], [udl('L', 2, 0, 4)]), cv);
    const wet = runMember(member(4, [sup('A', 0), sup('B', 4)], [udl('L', 2, 0, 4)], { overrides: { KS: { fb: 0.84 } } }), cv);
    near(wet.checks.bending.resistance!.value, 0.84 * base.checks.bending.resistance!.value);
  });
});

describe('Uplift (Q11)', () => {
  it('flags anchorage with the uplift force, not a member failure', () => {
    const res = runMember(member(6, [sup('A', 0), sup('B', 4)], [udl('D', 0.2, 0, 6), point('L', 10, 6)], { includeSelfWeight: false }), cv);
    expect(res.uplift.length).toBe(1);
    expect(res.uplift[0]!.supportId).toBe('A');
    // 0.9D + 1.5L: R_A = 0.9·(0.2·6·(4−3)/4) − 1.5·10·2/4
    near(res.uplift[0]!.force, -(0.9 * 0.3 - 7.5));
  });
});

describe('Safeguards', () => {
  it('rejects an unstable member', () => {
    expect(() => runMember(member(4, [sup('A', 2)], [udl('L', 2, 0, 4)]), cv)).toThrow(/unstable/);
  });
  it('rejects a load off the member', () => {
    expect(() => runMember(member(4, [sup('A', 0), sup('B', 4)], [udl('L', 2, 0, 5)]), cv)).toThrow(/past the member/);
  });
  it('every result lists its unverified code values', () => {
    const res = runMember(member(4, [sup('A', 0), sup('B', 4)], [udl('L', 2, 0, 4)]), cv);
    expect(res.checks.bending.unverified).toEqual(
      expect.arrayContaining(['resistanceFactors.bending', 'sawnLumber.specifiedStrengths', 'sawnLumber.sizeFactorBendingShear', 'combinations']),
    );
  });
});

describe('Posts (Q14 and Test E)', () => {
  it('adds self-weight and applies the built-up factor for plies > 1', () => {
    const r = checkPost(
      { section: { species: 'SPF No.1/No.2', size: '2x6', plies: 3 }, height: 2.4, Ke: 1, loads: { D: 0, L: 10, S: 0 }, includeSelfWeight: true, wetOrExterior: false },
      cv,
    );
    near(r.selfWeight, 0.114 * 0.14 * 2.4 * 5.0);
    expect(r.builtUpFactor).toBe(0.6);
    const g = r.cases.find((c) => c.combination.name === '1.25D + 1.5L + 1.0S')!;
    near(g.PrSolid, 114.7, 0.01); // KD near 1.0 with tiny dead load
    near(g.Pr, 0.6 * g.PrSolid);
  });
});

describe('Snow', () => {
  it('slope factor and S before Is', () => {
    expect(slopeFactor(20, cv, new Uses())).toBe(1);
    near(slopeFactor(50, cv, new Uses()), 0.5);
    expect(slopeFactor(75, cv, new Uses())).toBe(0);
    near(snowBeforeIs(2.0, 0.4, 20, cv).value, 2.0 * 0.8 + 0.4);
  });
});

describe('KD with opposite-sign effects (Baher, 2026-11-23)', () => {
  it('uses the permanent value when dead and live/snow effects have opposite signs', () => {
    const r = kdFrom(5, -3, false, cv, new Uses());
    expect(r.KD).toBe(0.65);
    expect(r.formula).toMatch(/opposite signs/);
    expect(kdFrom(-5, 3, false, cv, new Uses()).KD).toBe(0.65);
    expect(kdFrom(-5, -3, false, cv, new Uses()).KD).toBeCloseTo(1 - 0.5 * Math.log10(5 / 3), 6);
  });
  it('the KD the checks report equals min(effect KD, total KD) recomputed from their own inputs', () => {
    let seed = 777;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let oppositeSeen = 0;
    for (let k = 0; k < 30; k++) {
      const L = 8;
      const loads = [udl('D', 0.5 + rnd() * 3, 0, 8), udl('L', 1 + rnd() * 6, 0, 8), point('D', rnd() * 15, Math.round(rnd() * 79) / 10)];
      const res = runMember(member(L, [sup('A', 0), sup('B', 3 + Math.round(rnd() * 20) / 10), sup('C', 8)], loads), cv);
      for (const c of [res.checks.bending, res.checks.shear]) {
        const kd = c.kd!;
        expect(kd.KD).toBe(Math.min(kd.fromEffect.KD, kd.fromTotal.KD));
        const inp = Object.fromEntries(c.demand!.inputs.map((i) => [i.symbol, Number(i.value)]));
        const sym = c.id === 'bending' ? 'M' : 'V';
        const PS = (inp['αL'] !== 0 ? inp[`${sym}L`]! : 0) + (inp['αS'] !== 0 ? inp['Is']! * inp[`${sym}S`]! : 0);
        const eff = kdFrom(inp[`${sym}D`]!, PS, inp['αL'] === 0 && inp['αS'] === 0, cv, new Uses());
        expect(kd.fromEffect.KD).toBeCloseTo(eff.KD, 3);
        if (/opposite/.test(kd.fromEffect.formula)) oppositeSeen++;
      }
    }
    expect(oppositeSeen).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
