// Save and open project files. A file is only accepted after full validation; a bad file never replaces the model.
import { APP_ID, SCHEMA_VERSION, type ModelGate, type Project, type SavedFile } from './types';
import { validateProject } from './validate';

export function serialize(project: Project, gate: ModelGate): string {
  const file: SavedFile = { app: APP_ID, schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString(), gate, project };
  return JSON.stringify(file, null, 1);
}

export type OpenResult = { ok: true; file: SavedFile } | { ok: false; error: string };

export function parseFile(text: string): OpenResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON. It may be damaged or not a Spanwise file. Nothing was changed.' };
  }
  const f = data as Partial<SavedFile>;
  if (!f || typeof f !== 'object' || f.app !== APP_ID) return { ok: false, error: 'This is not a Spanwise project file. Nothing was changed.' };
  if (typeof f.schemaVersion !== 'number') return { ok: false, error: 'This file has no format version. Nothing was changed.' };
  if (f.schemaVersion > SCHEMA_VERSION)
    return {
      ok: false,
      error: `This file was saved by a newer version of Spanwise (format ${f.schemaVersion}; this app reads up to ${SCHEMA_VERSION}). Update the app to open it. Nothing was changed.`,
    };
  if (f.schemaVersion < SCHEMA_VERSION)
    return { ok: false, error: `This file uses an older format (${f.schemaVersion}) that this version cannot convert. Nothing was changed.` };
  const errors = validateProject(f.project);
  if (errors.length) return { ok: false, error: `The file failed validation, so nothing was changed:\n• ${errors.slice(0, 8).join('\n• ')}` };
  return { ok: true, file: { ...(f as SavedFile), gate: f.gate === 'confirmed' ? 'confirmed' : 'unconfirmed' } };
}

// ---------- Browser autosave (IndexedDB). Every call tolerates a blocked or missing database. ----------

const DB = 'spanwise';
const STORE = 'autosave';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function autosave(text: string): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(text, 'current');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function loadAutosave(): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get('current');
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
