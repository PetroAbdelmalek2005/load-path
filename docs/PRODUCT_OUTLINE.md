# Load Path — Product Outline v0.2

One app for residential structural work in Ontario. Model the house in 3D. Apply any load in any shape. Trace every load to the foundation. Check every member with cited clauses. The engineer verifies and seals.

## 1. What to borrow from each reference tool

| Tool | What it does well | Borrow | Avoid |
| --- | --- | --- | --- |
| Revit | One building model with levels, views and element types | Levels, plan and 3D views of one model, element properties panel, IFC import | Family authoring, heavy setup, drafting focus |
| ETABS | Analytical model, load patterns, cases and combinations, diagrams on members | Load pattern → case → combination structure, member diagrams, utilisation colours | Steep learning curve, meshing, commercial-building focus |
| ForteWEB | Fast single-member sizing with clear inputs and a list of passing solutions | "Show me every section that passes" list, plain inputs, clean member report | Each member in isolation, no load path between members |
| SolidWorks | Direct manipulation, feature history, undo, parametric edits | Click-and-drag editing, history tree, parametric templates | Mechanical-part focus, part-assembly complexity |
| Jabacus | To be described by Baher | To be decided | To be decided |

The gap Load Path fills: no single tool joins the house model, the load path and code-checked member design in one simple workflow.

## 2. App structure: six workspaces

The top bar moves through six workspaces in order. The assistant panel and the 3D view stay available in all of them.

1. **Project.** Address, municipality, code edition, climate data, engineer, occupancy, default loads.
2. **Model.** Levels, walls, members and surfaces. Draw, import or let the assistant propose. Ends with "Confirm model".
3. **Loads.** Add loads of any type and shape. Templates for common items. Every load shows where it goes.
4. **Analyze.** Run the load path. See reactions, diagrams and utilisation across the whole model.
5. **Design.** Pick a member, see its checks, try other sections, accept a solution.
6. **Review and report.** Open-items list, verification status, PDF calculation package.

## 3. Modelling

### Element library

| Element | Behaviour in analysis |
| --- | --- |
| Floor joist, ceiling joist | 1D bending member, carries a surface strip |
| Rafter | 1D bending member on a slope; load resolved for slope |
| Beam, header, girder | 1D bending member; simple, continuous or cantilevered |
| Post, column | Axial member; buckling about both axes |
| Bearing wall (stud wall) | Line support; carries load down as a line load; stud check later |
| Non-bearing wall | Weight only, applied as a line or area dead load |
| Foundation wall, footing | Support only; reactions reported, not designed (later milestone) |
| Truss (supplied by others) | Reactions entered from the truss supplier; not designed |
| Opening | Cuts a wall; creates a header location |

### Drawing tools

- Plan view per level with a grid, snapping to walls and members, typed dimensions.
- Templates: "joists between two walls", "beam on two posts", "gable roof with ridge and rafters", "remove this wall".
- Copy a level up or down.
- Properties panel for any selected element: section, species and grade, status (existing, new, to remove), verified flag.
- Full undo and a history list.

### Imports (later milestones)

- DXF from scan apps (Polycam, magicplan) and from CAD.
- IFC from Revit.
- PDF drawings (vector first, scanned later).
- Photos and site notes through the assistant. Every imported item arrives `assumed`. The model stays `unconfirmed` until the engineer confirms it.

## 4. Loads

Full detail in `LOADS_SPEC.md`. Summary:

- **Types (load patterns):** dead, live, snow, rain; wind and earthquake later.
- **Shapes:** area (uniform, patch, varying), line (uniform, partial, trapezoidal, triangular), point, moment, self-weight.
- **Generated loads:** code live load by occupancy, roof snow from climate data, pattern live loading on continuous members, later snow drift and unbalanced snow.
- **Templates:** hot tub, bathtub, piano, stone countertop island, water heater, solar panels, green roof, rooftop HVAC unit, heavy tile floor, bookshelf wall. Each asks for weight and footprint and saves the source.
- **Traceability:** every member shows each load on it and where that load came from, back to its surface or the member above.

## 5. Analysis engines

1. **Member solver.** 1D direct stiffness beam element. Handles simple spans, continuous spans, cantilevers, partial and varying loads, point loads and moments. Equivalent nodal loads by numerical integration, so any load shape works.
2. **Load path solver.** Distributes surface loads to members by tributary width in the span direction. Solves members top-down. Passes reactions to the supporting member or wall as point or line loads. Detects cycles and unsupported members.
3. **Combination engine.** Builds every load combination from the code-values file. Runs pattern live loading on continuous members. Reports the governing combination per check.
4. **Later:** 2D and 3D frame analysis for lateral loads (the ETABS part), braced wall checks.

## 6. Design and code checks

- Wood to CSA O86 limit states design, first sawn lumber (solid and built-up), then LVL, PSL, glulam and I-joists.
- Checks: bending, shear, deflection (live or snow, and total), bearing, column buckling, combined bending and axial for posts with eccentric load (later).
- **Auto-sizing (the ForteWEB part):** for a selected member, list every section from the library that passes, sorted by depth, then by weight. The engineer picks one.
- **Proprietary products:** LVL and PSL values come from manufacturer literature. Store their source. Confirm usage rights before shipping manufacturer data.
- Later materials: steel beams and columns (CSA S16), concrete footings (CSA A23.3).

## 7. Results

### The member view

Click any member. The camera zooms to it, other members fade, and a side panel shows:

- Properties and verified status.
- Every load on it, with its source.
- Shear, moment and deflection diagrams, with a combination selector.
- Reactions at each support, and where they go next.
- Each check: ratio, pass or fail, formula, inputs, clause, UNVERIFIED badge where it applies.
- "What governs?" in one plain sentence.
- Section options that pass.

### Whole-model views

- Utilisation colours: green under 0.8, amber 0.8 to 1.0, red above 1.0.
- Load path highlight: select a load or a member and see every member its load passes through, down to the foundation.
- Reaction map at the foundation.
- Before and after compare for a renovation (existing versus proposed).

## 8. The assistant

A chat panel that acts only through defined tools:

- **Explain:** "Why does this beam fail?" It answers from the stored results and clause references.
- **Propose edits:** "Remove this wall and add a beam on two posts." It shows a preview. Edits apply only when the engineer clicks Accept.
- **Build from site data:** photos, notes and drawings become a proposed model with confidence levels. Everything arrives `assumed`.
- **Check the work:** "List every assumption still unverified."

It never produces a structural number on its own. It calls the engine.

## 9. What makes it easier than the reference tools

- Code defaults fill themselves in: live load by occupancy, snow by municipality, combinations by code edition.
- Templates for the common renovation jobs.
- Everything clickable: click a load, a member or a reaction to see where it comes from.
- Plain-language warnings, such as "This post has no support below it."
- One model from site visit to report. No re-entering numbers between tools.
- Progressive disclosure: simple inputs first, advanced factors behind an "Advanced" toggle.

## 10. What to leave out

- Photo-real rendering.
- Construction drawings and drafting.
- General finite element meshing.
- Commercial and high-rise buildings.
- Design of trusses supplied by others.

## 11. Build order

| Milestone | Delivers |
| --- | --- |
| 1. Engine core | Direct stiffness member solver, all load shapes on a member, combinations, wood checks, acceptance tests |
| 2. Model and 3D | Levels, elements, plan drawing, 3D view, click-to-zoom member panel |
| 3. Loads workspace | Area, line, point and moment loads in 3D, templates, distribution to members |
| 4. Load path | Top-down solving, reaction transfer, utilisation colours, load path highlight |
| 5. Design and report | Auto-sizing list, open-items list, PDF calculation package |
| 6. Imports | DXF, IFC, then PDF, each with confirmation |
| 7. Assistant | Explain, propose edits, build from photos and notes |
| 8. More materials and lateral | LVL, PSL, I-joists, steel, braced walls, frame analysis |

## 12. Open questions

- What does Jabacus do that Baher wants to keep?
- Which CSA O86 edition does the 2024 OBC adopt?
- Commercial licence terms for OBC text and for manufacturer product data.
- Will municipal plan reviewers accept the report format? Ask Mississauga and Toronto.
- Who is the first paying user: Baher's own service, or other engineers?
