// ===== Wall-removal beam engine (prototype) =====
// Units: kN, m, kPa for input; internal mm, N, MPa.
// ALL code values below are UNVERIFIED and must be checked against the
// purchased CSA O86 and 2024 OBC before any real use.

const ENGINE_VERSION = "0.1.0";

// Specified strengths, MPa. CSA O86 Table 6.3.1A (UNVERIFIED).
const SPECIES = {
  "SPF No.1/No.2":        { fb: 11.8, fv: 1.5, fc: 11.5, fcp: 5.3, E: 9500,  E05: 6500 },
  "SPF Select Structural":{ fb: 16.5, fv: 1.5, fc: 14.5, fcp: 5.3, E: 10500, E05: 7500 },
  "D.Fir-L No.1/No.2":    { fb: 11.0, fv: 1.9, fc: 14.0, fcp: 7.0, E: 11000, E05: 7000 },
  "D.Fir-L Select Structural": { fb: 16.5, fv: 1.9, fc: 19.0, fcp: 7.0, E: 12500, E05: 8500 }
};

// Lumber sizes: nominal -> actual depth mm (thickness 38 mm).
const SIZES = { "2x6": 140, "2x8": 184, "2x10": 235, "2x12": 286 };
const PLY_T = 38;

// Size factor for bending and shear, CSA O86 Table 6.4.5 (UNVERIFIED).
const KZ_BEND_SHEAR = { 89: 1.7, 114: 1.5, 140: 1.4, 184: 1.2, 235: 1.1, 286: 1.0 };

const WOOD_DENSITY = 5.0; // kN/m3, self-weight assumption

const CLAUSES = {
  snow:   "OBC Div. B 4.1.6.2",
  live:   "OBC Div. B Table 4.1.5.3",
  combos: "OBC Div. B Table 4.1.3.2.-A",
  kd:     "CSA O86 5.3.2",
  strengths: "CSA O86 Table 6.3.1A",
  kz:     "CSA O86 Table 6.4.5",
  kh:     "CSA O86 Table 6.4.4",
  bending:"CSA O86 6.5.4.1",
  kl:     "CSA O86 6.5.4.2",
  shear:  "CSA O86 6.5.5.2",
  bearing:"CSA O86 6.5.7",
  column: "CSA O86 6.5.6.2",
  builtupCol: "CSA O86 6.5.6.4",
  deflection: "OBC Div. B Table 9.4.3.1 / project criteria"
};

function snowLoad(s) {
  const base = s.Ss * (s.Cb * s.Cw * s.Cs * s.Ca) + s.Sr;
  return { base, uls: s.IsU * base, sls: s.IsS * base };
}

// Build specified (unfactored) line loads w (kN/m) and point loads per type.
// snowCase: "uls" or "sls" picks the importance factor for snow.
function buildLoads(inp, snowCase) {
  const snow = snowLoad(inp.snow);
  const S = snowCase === "sls" ? snow.sls : snow.uls;
  const sRatio = snowCase === "sls" ? inp.snow.IsS / inp.snow.IsU : 1.0;
  const w = { D: 0, L: 0, S: 0 };
  const items = [];
  for (const a of inp.areaLoads) {
    const p = a.type === "S" ? S : a.kPa;
    const val = p * a.trib;
    w[a.type] += val;
    items.push({ desc: a.desc, type: a.type, kPa: p, trib: a.trib, w: val });
  }
  for (const l of inp.lineLoads) {
    const val = l.type === "S" ? l.kNm * sRatio : l.kNm;
    w[l.type] += val;
    items.push({ desc: l.desc, type: l.type, w: val });
  }
  const d = SIZES[inp.beam.size];
  const sw = inp.beam.plies * PLY_T * d * 1e-6 * WOOD_DENSITY;
  w.D += sw;
  items.push({ desc: "Beam self-weight", type: "D", w: sw });
  const points = inp.pointLoads.map(p => ({
    desc: p.desc, type: p.type, a: p.a,
    P: p.type === "S" ? p.kN * sRatio : p.kN
  }));
  return { w, points, items, snow, selfWeight: sw };
}

// Simple-span analysis for line load w (kN/m) and point loads [{a (m), P (kN)}].
function analyse(L, w, points, EI_Nmm2) {
  let R1 = w * L / 2, R2 = w * L / 2;
  for (const p of points) { R1 += p.P * (L - p.a) / L; R2 += p.P * p.a / L; }
  const N = 400;
  const xs = [];
  for (let i = 0; i <= N; i++) xs.push(L * i / N);
  for (const p of points) xs.push(p.a);
  xs.sort((a, b) => a - b);
  let Mmax = 0, xM = 0, Dmax = 0, xD = 0;
  const Lmm = L * 1000;
  for (const x of xs) {
    let M = R1 * x - w * x * x / 2;
    for (const p of points) if (x > p.a) M -= p.P * (x - p.a);
    if (M > Mmax) { Mmax = M; xM = x; }
    if (EI_Nmm2) {
      const xm = x * 1000;
      // UDL: w kN/m = w N/mm
      let D = w * xm * (Lmm ** 3 - 2 * Lmm * xm ** 2 + xm ** 3) / (24 * EI_Nmm2);
      for (const p of points) {
        const P = p.P * 1000, a = p.a * 1000, b = Lmm - a;
        if (xm <= a) D += P * b * xm * (Lmm ** 2 - b ** 2 - xm ** 2) / (6 * Lmm * EI_Nmm2);
        else { const xr = Lmm - xm; D += P * a * xr * (Lmm ** 2 - a ** 2 - xr ** 2) / (6 * Lmm * EI_Nmm2); }
      }
      if (D > Dmax) { Dmax = D; xD = x; }
    }
  }
  return { R1, R2, Vmax: Math.max(R1, R2), Mmax, xM, Dmax, xD };
}

function totals(loads, L) {
  const t = { D: loads.w.D * L, L: loads.w.L * L, S: loads.w.S * L };
  for (const p of loads.points) t[p.type] += p.P;
  return t;
}

function loadDurationFactor(c, tot) {
  const PS = (c.L > 0 ? tot.L : 0) + (c.S > 0 ? tot.S : 0);
  const PL = tot.D;
  if (PS <= 0) return { KD: 0.65, note: "Dead load only: permanent duration" };
  if (PL > PS) {
    const kd = Math.max(0.65, 1 - 0.5 * Math.log10(PL / PS));
    return { KD: kd, note: `Dead load exceeds standard-term load: 1 - 0.5 log(${PL.toFixed(2)}/${PS.toFixed(2)})` };
  }
  return { KD: 1.0, note: "Standard term" };
}

function kzc(d, Lmm) { return Math.min(1.3, 6.3 * Math.pow(d * Lmm, -0.13)); }

function run(inp) {
  const L = inp.span;
  const sp = SPECIES[inp.beam.species];
  const d = SIZES[inp.beam.size];
  const n = inp.beam.plies;
  const b = n * PLY_T;
  const Smod = b * d * d / 6;          // mm3
  const I = b * d ** 3 / 12;           // mm4
  const An = b * d;                    // mm2
  const KZ = KZ_BEND_SHEAR[d];
  const KH = inp.beam.KH, KL = inp.beam.braced ? 1.0 : null;
  const KS = 1.0, KT = 1.0;

  const uls = buildLoads(inp, "uls");
  const sls = buildLoads(inp, "sls");
  const totU = totals(uls, L);

  const combos = inp.combos.map(c => {
    const w = c.D * uls.w.D + c.L * uls.w.L + c.S * uls.w.S;
    const pts = uls.points.map(p => ({ a: p.a, P: c[p.type] * p.P }));
    const res = analyse(L, w, pts, null);
    const kd = loadDurationFactor(c, totU);
    const Fb = sp.fb * kd.KD * KH * KS * KT;
    const Fv = sp.fv * kd.KD * KH * KS * KT;
    const Mr = KL === null ? 0 : 0.9 * Fb * Smod * KZ * KL / 1e6;     // kN.m
    const Vr = 0.9 * Fv * (2 * An / 3) * KZ / 1000;                   // kN
    const lb = inp.beam.bearing; // mm
    const Fcp = sp.fcp * kd.KD * KS * KT;
    const Qr = 0.8 * Fcp * (b * lb) * 1.0 * 1.0 / 1000;               // kN
    const lbReq = Math.max(res.R1, res.R2) * 1000 / (0.8 * Fcp * b);  // mm
    // Post
    const po = inp.post;
    const psp = SPECIES[po.species];
    const pd = SIZES[po.size];
    const pb = po.plies * PLY_T;
    const Le = po.height * 1000 * po.Ke;
    const Fc = psp.fc * kd.KD * KS * KT;
    function prAxis(dim) {
      const Cc = Le / dim;
      const kz = kzc(dim, Le);
      const KC = 1 / (1 + Fc * kz * Cc ** 3 / (35 * psp.E05 * KS * KT));
      return { Cc, kz, KC, Pr: 0.8 * Fc * (pb * pd) * kz * KC / 1000 };
    }
    const ax1 = prAxis(pb), ax2 = prAxis(pd);
    const gov = ax1.Pr < ax2.Pr ? ax1 : ax2;
    const PrPost = gov.Pr * po.builtUpFactor;
    const slenderOK = Math.max(ax1.Cc, ax2.Cc) <= 50;
    return {
      name: c.name, factors: c, w, res, KD: kd.KD, KDnote: kd.note,
      Fb, Fv, Mr, Vr, Fcp, Qr, lbReq,
      post: { Fc, ax1, ax2, gov, Pr: PrPost, slenderOK },
      ratios: {
        bending: KL === null ? Infinity : res.Mmax / Mr,
        shear: res.Vmax / Vr,
        bearing: Math.max(res.R1, res.R2) / Qr,
        post: slenderOK ? Math.max(res.R1, res.R2) / PrPost : Infinity
      }
    };
  });

  function governing(key) {
    let g = combos[0];
    for (const c of combos) if (c.ratios[key] > g.ratios[key]) g = c;
    return g;
  }

  // Deflection (specified loads, SLS snow)
  const EI = sp.E * I;
  const ptsOf = (types) => sls.points.filter(p => types.includes(p.type)).map(p => ({ a: p.a, P: p.P }));
  const defL = analyse(L, sls.w.L, ptsOf(["L"]), EI).Dmax;
  const defS = analyse(L, sls.w.S, ptsOf(["S"]), EI).Dmax;
  const defLive = Math.max(defL, defS);
  const defTot = analyse(L, sls.w.D + sls.w.L + sls.w.S, ptsOf(["D", "L", "S"]), EI).Dmax;
  const limLive = L * 1000 / inp.defl.live, limTot = L * 1000 / inp.defl.total;

  // Unfactored reactions for foundation
  const unf = {};
  for (const t of ["D", "L", "S"]) {
    unf[t] = analyse(L, uls.w[t], uls.points.filter(p => p.type === t).map(p => ({ a: p.a, P: p.P })), null);
  }

  return {
    version: ENGINE_VERSION,
    section: { b, d, n, Smod, I, An, KZ, KH, KL, sp, EI },
    loads: { uls, sls, totU },
    combos,
    gov: { bending: governing("bending"), shear: governing("shear"), bearing: governing("bearing"), post: governing("post") },
    deflection: { defL, defS, defLive, defTot, limLive, limTot,
      ratioLive: defLive / limLive, ratioTot: defTot / limTot },
    unfactored: unf
  };
}

if (typeof module !== "undefined") module.exports = { run, SPECIES, SIZES, snowLoad, analyse, CLAUSES };
