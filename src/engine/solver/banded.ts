// Banded symmetric solver (Gaussian elimination without pivoting).
// The stiffness matrix of a beam is symmetric, positive definite once supported, and banded.

export class BandedMatrix {
  readonly n: number;
  readonly hb: number; // half bandwidth: entries (i, j) with i <= j <= i + hb are stored
  readonly data: Float64Array;

  constructor(n: number, hb: number) {
    this.n = n;
    this.hb = hb;
    this.data = new Float64Array(n * (hb + 1));
  }

  /** Add v to entry (i, j). Only the upper band is stored; (j, i) is implied by symmetry. */
  add(i: number, j: number, v: number): void {
    const [r, c] = i <= j ? [i, j] : [j, i];
    if (c - r > this.hb) throw new Error('Entry outside band');
    this.data[r * (this.hb + 1) + (c - r)]! += v;
  }

  get(i: number, j: number): number {
    const [r, c] = i <= j ? [i, j] : [j, i];
    if (c - r > this.hb) return 0;
    return this.data[r * (this.hb + 1) + (c - r)]!;
  }

  /** Replace row and column i with the identity (used for a restrained degree of freedom). */
  restrain(i: number): void {
    const w = this.hb + 1;
    for (let k = Math.max(0, i - this.hb); k < i; k++) this.data[k * w + (i - k)] = 0;
    for (let c = 0; c <= this.hb; c++) this.data[i * w + c] = 0;
    this.data[i * w] = 1;
  }

  clone(): BandedMatrix {
    const m = new BandedMatrix(this.n, this.hb);
    m.data.set(this.data);
    return m;
  }
}

export class UnstableError extends Error {
  constructor(public readonly dof: number) {
    super('The member is unstable: it can move or rotate freely. Add or change supports.');
  }
}

/** Factorised matrix, ready to solve for many load vectors. */
export class BandedFactor {
  private readonly u: Float64Array;
  private readonly n: number;
  private readonly hb: number;

  constructor(m: BandedMatrix) {
    this.n = m.n;
    this.hb = m.hb;
    const w = this.hb + 1;
    const u = new Float64Array(m.data);
    // A pivot that collapses relative to its own original diagonal means a free mechanism.
    const diag0 = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) diag0[i] = Math.abs(u[i * w]!);
    for (let k = 0; k < this.n; k++) {
      const pivot = u[k * w]!;
      if (!(pivot > diag0[k]! * 1e-9)) throw new UnstableError(k);
      const last = Math.min(this.n - 1, k + this.hb);
      for (let i = k + 1; i <= last; i++) {
        const f = u[k * w + (i - k)]! / pivot;
        if (f === 0) continue;
        for (let j = i; j <= last; j++) u[i * w + (j - i)]! -= f * u[k * w + (j - k)]!;
      }
    }
    this.u = u;
  }

  solve(b: Float64Array): Float64Array {
    const { n, hb, u } = this;
    const w = hb + 1;
    const y = new Float64Array(b);
    for (let k = 0; k < n; k++) {
      const pivot = u[k * w]!;
      const last = Math.min(n - 1, k + hb);
      for (let i = k + 1; i <= last; i++) y[i]! -= (u[k * w + (i - k)]! / pivot) * y[k]!;
    }
    const x = new Float64Array(n);
    for (let k = n - 1; k >= 0; k--) {
      let s = y[k]!;
      const last = Math.min(n - 1, k + hb);
      for (let j = k + 1; j <= last; j++) s -= u[k * w + (j - k)]! * x[j]!;
      x[k] = s / u[k * w]!;
    }
    return x;
  }
}
