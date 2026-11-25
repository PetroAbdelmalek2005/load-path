// Reads code-values.json, checks every entry, and builds the CodeValues object the engine needs.
import raw from '../data/code-values.json';
import defaults from '../data/project-defaults.json';
import type { CodeValue, CodeValues, ProjectSettings } from '../engine/types';

export interface RawEntry {
  value: unknown;
  units: string;
  source: { document: string; edition: string; ref: string };
  verified: boolean;
  verifiedBy: string | null;
  verifiedDate: string | null;
  note: string;
}

export class CodeValueError extends Error {}

function isEntry(v: unknown): v is RawEntry {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return 'value' in o && 'verified' in o && 'source' in o;
}

/** Every entry in the file, keyed by dotted path. Throws if an entry is missing a required field. */
export function listEntries(json: unknown = raw): Map<string, RawEntry> {
  const out = new Map<string, RawEntry>();
  const walk = (node: unknown, path: string) => {
    if (isEntry(node)) {
      const missing = ['units', 'note', 'verifiedBy', 'verifiedDate'].filter((k) => !(k in (node as object)));
      const src = node.source as Partial<RawEntry['source']>;
      if (!src || typeof src.document !== 'string' || typeof src.ref !== 'string' || typeof src.edition !== 'string') missing.push('source');
      if (typeof node.verified !== 'boolean') missing.push('verified');
      if (node.verified && (!node.verifiedBy || !node.verifiedDate)) missing.push('verifiedBy/verifiedDate (required when verified)');
      if (missing.length) throw new CodeValueError(`Code value "${path}" is missing: ${missing.join(', ')}`);
      out.set(path, node);
      return;
    }
    if (typeof node === 'object' && node !== null && !Array.isArray(node)) {
      for (const [k, v] of Object.entries(node)) {
        if (k.startsWith('_') || k === 'schemaVersion') continue;
        walk(v, path ? `${path}.${k}` : k);
      }
    }
  };
  walk(json, '');
  return out;
}

export function buildCodeValues(json: unknown = raw): CodeValues {
  const entries = listEntries(json);
  function get<T>(key: string): CodeValue<T> {
    const e = entries.get(key);
    if (!e) throw new CodeValueError(`Code value "${key}" is missing from code-values.json.`);
    if (e.value === null || e.value === undefined) throw new CodeValueError(`Code value "${key}" has no value yet.`);
    return { key, value: e.value as T, units: e.units, ref: `${e.source.document} ${e.source.ref}`.trim(), verified: e.verified };
  }
  return {
    woodDensity: get('loads.woodDensity'),
    IsULS: get('snow.Is_ULS_normal'),
    IsSLS: get('snow.Is_SLS_normal'),
    combinations: get('combinations'),
    slsCombinations: get('serviceability.combinations'),
    kdStandard: get('loadDuration.standard'),
    kdPermanent: get('loadDuration.permanent'),
    kdDeadDominant: get('loadDuration.deadDominantFormula'),
    phiBending: get('resistanceFactors.bending'),
    phiShear: get('resistanceFactors.shear'),
    phiCompression: get('resistanceFactors.compressionParallel'),
    phiBearing: get('resistanceFactors.bearing'),
    plyThickness: get('sawnLumber.plyThickness'),
    depths: get('sawnLumber.depths'),
    strengths: get('sawnLumber.specifiedStrengths'),
    sizeFactorBendingShear: get('sawnLumber.sizeFactorBendingShear'),
    systemFactorBuiltUp: get('sawnLumber.systemFactorBuiltUp'),
    columnSizeFactor: get('sawnLumber.columnSizeFactor'),
    columnStabilityConstant: get('sawnLumber.columnStabilityConstant'),
    columnSlendernessMax: get('sawnLumber.columnSlendernessMax'),
    builtUpColumnFactor: get('sawnLumber.builtUpColumnFactor'),
    KB: get('sawnLumber.bearingFactorKB'),
    KZcp: get('sawnLumber.bearingSizeFactorKZcp'),
    KS: get('sawnLumber.serviceConditionKS'),
    KT: get('sawnLumber.treatmentFactorKT'),
    deflectionLiveSnow: get('serviceability.deflectionLiveOrSnow'),
    deflectionTotal: get('serviceability.deflectionTotal'),
    snowCb: get('snow.Cb_default'),
    snowCw: get('snow.Cw_default'),
    snowCa: get('snow.Ca_default'),
    snowCsRule: get('snow.Cs_rule'),
  };
}

export function projectDefaults(): ProjectSettings & { postKe: number } {
  return {
    cantileverDeflectionMultiplier: defaults.cantileverDeflectionMultiplier.value,
    defaultBearingLength: defaults.defaultBearingLength.value,
    maxSpans: defaults.maxSpansForPatternLoading.value,
    postKe: defaults.postEffectiveLengthFactorKe.value,
  };
}

/** Lookup of every entry for the UI (UNVERIFIED badges, notes). */
export function codeValueIndex(): Map<string, RawEntry> {
  return listEntries(raw);
}

/** Lumber section sizes for model geometry (from code-values.json). */
export function sectionTables(): { depths: Record<string, number>; plyThickness: number } {
  const cv = buildCodeValues();
  return { depths: cv.depths.value, plyThickness: cv.plyThickness.value };
}
