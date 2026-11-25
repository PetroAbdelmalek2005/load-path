# Spanwise

A structural design assistant for residential wood-frame houses in Ontario.

**Not for construction until reviewed and sealed by a licensed engineer.**

## Status

- **Milestone 1 (engine core): done.** Beam solver, all member load shapes, combinations with pattern loading, wood checks, single-member Engine test page.
- **Milestone 2 (model and 3D): built.** Project and Model workspaces, levels, plan drawing with snapping and ft-in input, walls, beams, posts, openings with headers, floor and roof surfaces, 3D view with click-to-zoom, model gate, undo/redo, save and open.

See `docs/PRODUCT_OUTLINE.md` for the plan.

## Project rules

See `CLAUDE.md`. Engineering decisions are in `docs/DECISIONS.md`. Code values still to verify are in `docs/CODE_VALUES_TO_VERIFY.md`.

## Commands

These need Node.js 22 or newer.

| Command | What it does |
| --- | --- |
| `npm install` | Downloads the libraries the project uses. Run once. |
| `npm test` | Runs every engine, model and acceptance test. |
| `npm run e2e` | Runs the browser tests (needs `npm run build` first). |
| `npm run dev` | Starts the test page at http://localhost:5173 |
| `npm run build` | Builds the page into `dist/` for hosting. |
| `npm run verify-list` | Regenerates `docs/CODE_VALUES_TO_VERIFY.md` after code values change. |
