// Shared UI state: the one model store, view settings, and browser autosave.
import { useStore } from 'zustand';
import { create } from 'zustand';
import { createModelStore, type ModelState } from '../model/store';
import { autosave, loadAutosave, parseFile, serialize } from '../model/persist';
import { sectionTables } from '../model/codeValues';
import type { MemberForm } from '../model/memberForm';

export const tables = sectionTables();
export const modelStore = createModelStore();

export function useModel<T>(sel: (s: ModelState) => T): T {
  return useStore(modelStore, sel);
}

export type Tool = 'select' | 'wall' | 'beam' | 'post' | 'floor' | 'roof' | 'opening';
export type WallRef = 'centre' | 'left' | 'right';

interface UIState {
  tool: Tool;
  wallRef: WallRef;
  ortho: boolean;
  selectedId: string | null;
  levelId: string | null;
  view: 'plan' | '3d';
  hiddenLevels: string[];
  engineSeed: MemberForm | null;
  notice: string | null;
  set: (p: Partial<UIState>) => void;
}

export const useUI = create<UIState>((set) => ({
  tool: 'select',
  wallRef: 'centre',
  ortho: true,
  selectedId: null,
  levelId: null,
  view: 'plan',
  hiddenLevels: [],
  engineSeed: null,
  notice: null,
  set: (p) => set(p),
}));

/** The level being drawn on; falls back to the first level. */
export function useActiveLevelId(): string {
  const levels = useModel((s) => s.project.levels);
  const id = useUI((s) => s.levelId);
  return levels.some((l) => l.id === id) ? id! : levels[0]!.id;
}

// ---------- Autosave ----------

let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

export async function startAutosave(): Promise<void> {
  if (started) return;
  started = true;
  const text = await loadAutosave();
  if (text) {
    const r = parseFile(text);
    // Restore only if nothing has been edited since the page opened.
    if (r.ok && modelStore.getState().past.length === 0) {
      modelStore.getState().load(r.file.project, r.file.gate);
      useUI.getState().set({ notice: 'Restored your last project from this browser.' });
    }
  }
  if (typeof window !== 'undefined') (window as unknown as { __spanwiseReady: boolean }).__spanwiseReady = true;
  modelStore.subscribe((s, prev) => {
    if (s.project === prev.project && s.gate === prev.gate) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void autosave(serialize(s.project, s.gate)), 600);
  });
}

// Test hook: lets end-to-end tests read the model. Read-only use only.
if (typeof window !== 'undefined') (window as unknown as { __spanwise: typeof modelStore }).__spanwise = modelStore;
