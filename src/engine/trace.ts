// Traceable results: every number carries formula, inputs, result, units and clause.
import type { CodeValue } from './types';

export interface TraceInput {
  symbol: string;
  value: number | string;
  units: string;
  /** Code value key when the input came from code-values.json. */
  codeKey?: string;
  verified?: boolean;
}

export interface Traced {
  label: string;
  formula: string;
  inputs: TraceInput[];
  value: number;
  units: string;
  clause: string;
  /** Keys of unverified code values this result depends on. Non-empty => show UNVERIFIED. */
  unverified: string[];
}

/** Collects the code values a calculation uses, so unverified ones are never lost. */
export class Uses {
  private readonly keys = new Set<string>();

  cv<T>(c: CodeValue<T>): T {
    if (!c.verified) this.keys.add(c.key);
    return c.value;
  }

  /** Input line for a code value. */
  input(symbol: string, c: CodeValue<number>, value?: number): TraceInput {
    const v = value ?? this.cv(c);
    if (!c.verified) this.keys.add(c.key);
    return { symbol, value: v, units: c.units, codeKey: c.key, verified: c.verified };
  }

  merge(other: Uses | string[]): this {
    const list = other instanceof Uses ? other.list() : other;
    for (const k of list) this.keys.add(k);
    return this;
  }

  list(): string[] {
    return [...this.keys].sort();
  }
}

export function round(v: number, digits = 3): number {
  if (!Number.isFinite(v)) return v;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
