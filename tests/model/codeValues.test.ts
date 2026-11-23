import { describe, expect, it } from 'vitest';
import { buildCodeValues, listEntries, CodeValueError } from '../../src/model/codeValues';

describe('code-values.json', () => {
  it('every entry has value, units, source, verified, verifiedBy, verifiedDate and note', () => {
    const entries = listEntries();
    expect(entries.size).toBeGreaterThan(30);
    for (const [, e] of entries) {
      expect(typeof e.source.document).toBe('string');
      expect(typeof e.source.ref).toBe('string');
      expect(typeof e.verified).toBe('boolean');
    }
  });
  it('builds every value the engine needs', () => {
    const cv = buildCodeValues();
    expect(cv.combinations.value.length).toBe(5);
    expect(cv.phiBending.ref).toMatch(/O86/);
  });
  it('rejects an entry with a missing field', () => {
    expect(() => listEntries({ a: { value: 1, verified: false, source: { document: 'x', edition: 'y', ref: 'z' } } })).toThrow(CodeValueError);
  });
  it('rejects verified = true without verifiedBy and verifiedDate', () => {
    const bad = { a: { value: 1, units: '-', note: '', verified: true, verifiedBy: null, verifiedDate: null, source: { document: 'x', edition: 'y', ref: 'z' } } };
    expect(() => listEntries(bad)).toThrow(/verifiedBy/);
  });
});
