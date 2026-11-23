# CLAUDE.md — Spanwise

Claude Code reads this file at the start of every session. Follow it on every task.

## What we are building

Spanwise (working title was Load Path): a 3D structural design assistant for residential wood-frame houses in Ontario, Canada. The engineer models the house, applies loads of any type and shape, traces them to the foundation, and checks every member against CSA O86 with cited clauses. Full vision: `docs/PRODUCT_OUTLINE.md`. Loads in detail: `docs/LOADS_SPEC.md`.

## Who you work with

- Baher, a civil/structural EIT (P.Eng expected 2027). He knows the engineering. He does not code.
- Explain every command he must run, one step at a time, in plain words.
- Ask him engineering questions directly. Never guess an engineering value or code requirement.
- Short sentences. No jargon without a one-line explanation.

## Non-negotiable rules

1. **Engineer in the loop.** The app never issues a design. Every screen, export and report shows: "Not for construction until reviewed and sealed by a licensed engineer."
2. **Deterministic calculations only.** Every structural number comes from `src/engine/`, which is pure and unit-tested. AI features may propose geometry, loads or explanations. They never compute a structural value.
3. **Traceable numbers.** Every result carries formula, inputs, factors, result, units and clause reference.
4. **Verified vs assumed.** Every geometry item and load has a status: `verified` or `assumed`. Reports list everything still `assumed`.
5. **Model gate.** Imported or AI-proposed geometry makes the model `unconfirmed`. Calculations stay locked until the engineer clicks "Confirm model". Any later geometry change resets it to `unconfirmed`.
6. **Code values are data.** Every code value lives in `src/data/code-values.json` (seeded from `docs/CODE_VALUES_SEED.json`). Each entry has value, units, source (document, edition, clause or table), `verified`, `verifiedBy`, `verifiedDate`, note. No code value is hard-coded in the engine.
7. **Unverified values are visible.** Any result that depends on an unverified code value shows an "UNVERIFIED" badge.
8. **No copyrighted code text.** Store clause numbers and Baher's own summaries only. Never paste text from the OBC or CSA standards into the app or its data.
9. **SI units.** kN, m, kPa, MPa, mm, kN·m. Label units on every input and output.

## Stack

- Vite + React + TypeScript (strict mode).
- Three.js through @react-three/fiber and @react-three/drei for 3D.
- Zustand for state. Immer for undoable model edits.
- Vitest for tests. Playwright for a few end-to-end smoke tests later.
- No backend until Baher asks. Projects save as JSON files and in IndexedDB.

## Folder layout

```
src/
  engine/      pure calculation code: solver, loads, combinations, checks. No React, no DOM, no AI.
  model/       data types, validation, edit operations, load distribution to members.
  data/        code-values.json, section and species tables, load templates.
  ui/          React screens, 3D viewer, panels, charts.
  ai/          later milestones only: import and assistant adapters.
tests/         unit tests mirror src/ folders.
docs/          product docs. Keep DECISIONS.md and CODE_VALUES_TO_VERIFY.md here.
reference/     the old prototype engine.js. Read-only reference.
```

Layers import downward only: `ui` → `model` → `engine`. The engine imports nothing from the others.

## How to work

- Before each milestone: write a short plan, the files you will touch, and the questions you need answered. Wait for Baher's approval.
- Write tests with every engine function. All acceptance tests in `docs/ACCEPTANCE_TESTS.md` must pass before a milestone is called done.
- After each milestone: tell Baher exactly how to start the app, what to click to test it, and what is not done yet.
- Record every engineering assumption in `docs/DECISIONS.md` with the reason.
- Regenerate `docs/CODE_VALUES_TO_VERIFY.md` from the JSON whenever code values change.
- Commit to git at the end of each working step with a clear message.
- If a request conflicts with good engineering or good software practice, stop and explain instead of building it.
