// Structural validation of a Project (shape, IDs, links). Returns plain-language errors.
import type { Project } from './types';

const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const isPt = (v: unknown) => !!v && typeof v === 'object' && isNum((v as { x: unknown }).x) && isNum((v as { y: unknown }).y);
const isSec = (v: unknown) =>
  !!v && typeof v === 'object' && typeof (v as { species: unknown }).species === 'string' && typeof (v as { size: unknown }).size === 'string' && isNum((v as { plies: unknown }).plies);

export function validateProject(p: unknown): string[] {
  const errs: string[] = [];
  if (!p || typeof p !== 'object') return ['Project data is missing.'];
  const pr = p as Project;
  if (typeof pr.id !== 'string') errs.push('Project has no ID.');
  if (!pr.info || typeof pr.info !== 'object') errs.push('Project information is missing.');
  if (!pr.defaults || typeof pr.defaults !== 'object') errs.push('Drawing defaults are missing.');
  if (!Array.isArray(pr.levels) || pr.levels.length === 0) errs.push('The project has no levels.');
  if (!Array.isArray(pr.elements)) errs.push('The element list is missing.');
  if (errs.length) return errs;
  const ids = new Set<string>();
  const levelIds = new Set<string>();
  for (const l of pr.levels) {
    if (typeof l.id !== 'string' || !isNum(l.elevation) || !isNum(l.wallHeight) || !isNum(l.floorDepth)) errs.push(`Level "${l?.name}" has missing values.`);
    if (ids.has(l.id)) errs.push(`Duplicate ID ${l.id}.`);
    ids.add(l.id);
    levelIds.add(l.id);
  }
  for (const e of pr.elements) {
    const where = `${e?.label ?? '?'} (${e?.kind ?? '?'})`;
    if (typeof e.id !== 'string') errs.push(`${where} has no ID.`);
    if (ids.has(e.id)) errs.push(`Duplicate ID ${e.id}.`);
    ids.add(e.id);
    if (!levelIds.has(e.levelId)) errs.push(`${where} is on a level that does not exist.`);
    if (e.status !== 'verified' && e.status !== 'assumed') errs.push(`${where} has no verified/assumed status.`);
    if (!['existing', 'new', 'remove'].includes(e.lifecycle)) errs.push(`${where} has no existing/new/remove status.`);
    switch (e.kind) {
      case 'wall':
        if (!isPt(e.a) || !isPt(e.b) || !isNum(e.thickness) || !isNum(e.height) || !isNum(e.studSpacing) || !isNum(e.plates) || typeof e.bearing !== 'boolean')
          errs.push(`${where} has missing values.`);
        break;
      case 'beam':
        if (!isPt(e.a) || !isPt(e.b) || !isSec(e.section) || !isNum(e.topElevation)) errs.push(`${where} has missing values.`);
        break;
      case 'post':
        if (!isPt(e.at) || !isSec(e.section)) errs.push(`${where} has missing values.`);
        break;
      case 'surface':
        if (!Array.isArray(e.polygon) || e.polygon.length < 3 || !e.polygon.every(isPt) || !isNum(e.spanDirection)) errs.push(`${where} has missing values.`);
        break;
      case 'opening':
        if (typeof e.wallId !== 'string' || !isNum(e.offset) || !isNum(e.width)) errs.push(`${where} has missing values.`);
        break;
      default:
        errs.push(`Unknown element type "${(e as { kind?: string }).kind}".`);
    }
  }
  if (errs.length) return errs;
  const byId = new Map(pr.elements.map((e) => [e.id, e]));
  for (const e of pr.elements) {
    if (e.kind === 'opening' && byId.get(e.wallId)?.kind !== 'wall') errs.push(`Opening ${e.label} is not in a wall.`);
    if (e.kind === 'opening' && e.headerId && byId.get(e.headerId)?.kind !== 'beam') errs.push(`Opening ${e.label} links to a missing header.`);
    if (e.kind === 'post' && e.supportsId && byId.get(e.supportsId)?.kind !== 'beam') errs.push(`Post ${e.label} links to a missing beam.`);
    if (e.kind === 'post' && e.baseId && !['wall', 'beam'].includes(byId.get(e.baseId)?.kind ?? '')) errs.push(`Post ${e.label} stands on a missing element.`);
  }
  return errs;
}
