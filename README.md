# Spanwise

A structural design assistant for residential wood-frame houses in Ontario.

**Not for construction until reviewed and sealed by a licensed engineer.**

## Status

Milestone 1 (engine core) is built. It includes:

- The beam solver
- Every member load shape
- Combinations with pattern loading
- Wood checks for bending, shear, bearing, deflection and posts
- A single-member test page

See `docs/PRODUCT_OUTLINE.md` for the plan.

## Project rules

See `CLAUDE.md`. Engineering decisions are in `docs/DECISIONS.md`. Code values still to verify are in `docs/CODE_VALUES_TO_VERIFY.md`.

## Commands

These need Node.js 22 or newer.

| Command | What it does |
| --- | --- |
| `npm install` | Downloads the libraries the project uses. Run once. |
| `npm test` | Runs every engine and acceptance test. |
| `npm run dev` | Starts the test page at http://localhost:5173 |
| `npm run build` | Builds the page into `dist/` for hosting. |
| `npm run verify-list` | Regenerates `docs/CODE_VALUES_TO_VERIFY.md` after code values change. |
