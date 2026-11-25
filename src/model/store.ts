// Model store: the project, undo/redo history (immer patches) and the model gate.
// Built on zustand/vanilla so tests can use it without React.
import { createStore } from 'zustand/vanilla';
import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';
import type { ModelGate, Project } from './types';
import { newProject } from './edits';

enablePatches();

export interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
  geometry: boolean;
}

export interface ModelState {
  project: Project;
  gate: ModelGate;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Change the project. `geometry: false` for changes that do not affect geometry (status, labels, notes, project info). */
  apply: (label: string, recipe: (draft: Project) => void, opts?: { geometry?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  confirm: () => void;
  load: (project: Project, gate: ModelGate) => void;
}

export function createModelStore(initial?: Project) {
  return createStore<ModelState>()((set, get) => ({
    project: initial ?? newProject(),
    gate: 'unconfirmed',
    past: [],
    future: [],
    apply: (label, recipe, opts) => {
      const geometry = opts?.geometry ?? true;
      const [next, patches, inverse] = produceWithPatches(get().project, recipe);
      if (patches.length === 0) return;
      set((s) => ({
        project: next,
        past: [...s.past, { label, patches, inverse, geometry }],
        future: [],
        gate: geometry ? 'unconfirmed' : s.gate,
      }));
    },
    undo: () => {
      const { past, project } = get();
      const e = past[past.length - 1];
      if (!e) return;
      set((s) => ({
        project: applyPatches(project, e.inverse),
        past: s.past.slice(0, -1),
        future: [e, ...s.future],
        // Undo never restores "confirmed" (DECISIONS.md 2026-11-25).
        gate: e.geometry ? 'unconfirmed' : s.gate,
      }));
    },
    redo: () => {
      const { future, project } = get();
      const e = future[0];
      if (!e) return;
      set((s) => ({
        project: applyPatches(project, e.patches),
        past: [...s.past, e],
        future: s.future.slice(1),
        gate: e.geometry ? 'unconfirmed' : s.gate,
      }));
    },
    confirm: () => set({ gate: 'confirmed' }),
    load: (project, gate) => set({ project, gate, past: [], future: [] }),
  }));
}

export type ModelStore = ReturnType<typeof createModelStore>;
