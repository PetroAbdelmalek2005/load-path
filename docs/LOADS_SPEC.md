# Loads Specification

How loads are defined, drawn, distributed to members and combined. Any value marked "to verify" must come from `code-values.json`, never from this file.

## 1. Load patterns (types)

| Pattern | Code | Milestone | Notes |
| --- | --- | --- | --- |
| Dead | D | 1 | Includes self-weight, generated automatically |
| Live | L | 1 | Default by occupancy from code values; editable |
| Snow | S | 1 | Generated from climate data and roof geometry |
| Rain | R | later | Ponding checks later; Sr already sits inside the snow formula |
| Wind | W | 8 | Lateral; with braced wall and frame analysis |
| Earthquake | E | 8 | Lateral; with frame analysis |

A **load case** is one pattern, or one arrangement of a pattern (for example, live load on span 1 only). A **load combination** factors and adds cases. Combinations come from `code-values.json`.

## 2. Load shapes

| # | Shape | Defined by | Example |
| --- | --- | --- | --- |
| 1 | Area, uniform | Surface or polygon, q (kPa) | Floor dead and live load |
| 2 | Area, patch | Polygon on a surface, q (kPa) | Hot tub footprint |
| 3 | Area, linearly varying | Polygon, q1 and q2 (kPa), direction | Snow drift against a taller wall |
| 4 | Line, uniform | Member or polyline, w (kN/m), start and end | Wall above on a beam |
| 5 | Line, partial | Member, w (kN/m), x1 and x2 (m) | Wall above that stops partway |
| 6 | Line, trapezoidal or triangular | Member, w1 at x1, w2 at x2 | Hip roof load on a girder |
| 7 | Point force | Member and x (m), or a point on a surface, P (kN) | Post from above, piano leg |
| 8 | Point moment | Member and x (m), M (kN·m) | Eccentric connection, cantilever end |
| 9 | Self-weight | Automatic from section and density | Every member |

Every load stores: `id`, `pattern`, `label`, `shape`, geometry, magnitudes, `source`, `status` (`verified` or `assumed`), `notes`.

`source.kind` is one of: `manual`, `code` (generated from code values), `template`, `reaction` (passed down from a member above), `import`, `ai`.

### TypeScript sketch

```ts
type Pattern = 'D' | 'L' | 'S' | 'R' | 'W' | 'E';
type Status = 'verified' | 'assumed';
type SourceKind = 'manual' | 'code' | 'template' | 'reaction' | 'import' | 'ai';

interface LoadBase {
  id: string;
  pattern: Pattern;
  label: string;
  source: { kind: SourceKind; ref?: string };   // ref: template id, member id, clause key
  status: Status;
  notes?: string;
}

interface AreaLoad extends LoadBase {
  shape: 'area';
  surfaceId?: string;                 // whole surface
  polygon?: [number, number][];       // patch on a level, in plan, metres
  q1: number;                         // kPa
  q2?: number;                        // kPa, for linearly varying
  varyAlong?: [number, number];       // unit vector in plan for q1 -> q2
}

interface LineLoad extends LoadBase {
  shape: 'line';
  memberId?: string;
  polyline?: [number, number][];      // on a surface, in plan
  x1: number; x2: number;             // m along member (0 to length)
  w1: number; w2: number;             // kN/m; equal for uniform
}

interface PointLoad extends LoadBase {
  shape: 'point';
  memberId?: string; x?: number;      // on a member
  at?: [number, number];              // or on a surface, in plan
  P: number;                          // kN, positive downward
}

interface MomentLoad extends LoadBase {
  shape: 'moment';
  memberId: string; x: number;
  M: number;                          // kN·m, sign by member local axis
}
```

## 3. Generated loads

- **Live load by occupancy.** Each surface has an occupancy. The value comes from `code-values.json` (OBC Div. B Table 4.1.5.3, to verify). No live load reduction by tributary area in early milestones (conservative; record in DECISIONS.md).
- **Roof snow.** S = Is[Ss(Cb Cw Cs Ca) + Sr] (OBC Div. B 4.1.6.2, to verify). Ss and Sr from the project's municipality. Cs from roof slope. Applied on horizontal projection.
- **Pattern live load.** For continuous members, the engine also runs live load on alternate spans and on adjacent spans, and keeps the worst result per check.
- **Later:** snow drift at roof steps, unbalanced snow on gable roofs, sliding snow. Each generates shape 3 area loads with their clause reference (OBC Div. B 4.1.6, clauses to confirm).
- **Self-weight.** Section area × density from `code-values.json` (5.0 kN/m³ default for wood, assumed).

## 4. Templates

Each template asks for inputs, creates loads, and stores the inputs as the source. No template supplies a hidden default weight. The engineer enters the manufacturer or measured value.

| Template | Inputs | Creates |
| --- | --- | --- |
| Hot tub | Filled weight (kN), footprint | Area patch, dead (shell) and live (water and people) split as the engineer chooses |
| Bathtub | Filled weight, footprint | Area patch |
| Piano | Weight, leg positions | Point loads |
| Stone countertop island | Weight per m², footprint | Area patch, dead |
| Water heater | Filled weight, footprint | Area patch or point |
| Solar panels | Weight per m², roof area | Area uniform, dead |
| Green roof | Saturated weight per m², area | Area uniform, dead |
| Rooftop HVAC unit | Weight, support points | Point loads |
| Heavy tile floor | Weight per m², area | Area uniform, dead |
| Bookshelf wall | Weight per m, length | Line load, live or dead as chosen |
| Wall above | Height, weight per m² of wall | Line load, dead |

## 5. Distribution from surfaces to members

Surfaces span one way in version 1. Two-way spanning comes later.

1. **Uniform area load:** each supporting member gets a line load w = q × tributary width. Tributary width = half the distance to the next parallel member on each side, or to the edge support.
2. **Patch load:** each member gets a partial line load over the length the patch covers, using that member's tributary strip.
3. **Varying load:** each member gets a trapezoidal line load. Its intensity follows the pressure under that member's strip.
4. **Point load on a surface between members:** split to the two neighbouring members by the lever rule. Mark it `assumed` with a note.
5. **Line load parallel to the joists** (such as a wall above): the engineer chooses one of three options. It goes to one joist, to a doubled joist, or spreads over n joists. Record the choice.
6. **Line load across the joists:** a point load on each joist at its spacing, or a line load on a joist system.
7. **Sloped roofs:** dead load per sloped area converts to horizontal projection. Snow is on horizontal projection.

**Joist systems.** The engineer may model a floor as a "joist system": a surface with joist size, spacing and span direction. The app checks one typical joist and the most loaded joist under any patch or line load. This avoids drawing every joist.

## 6. Reaction transfer

- Each support reaction, per load case, becomes a `reaction` load on the supporting element. It is a point load on a beam, a line load on a wall, or an axial load on a post.
- Reactions keep their pattern (D, L, S), so combinations happen only at the member being checked. Never transfer factored loads.
- Each transferred load links to the member it came from. The UI can walk the chain both ways.

## 7. Display in 3D

- Colours by pattern: dead grey, live blue, snow light cyan, reaction purple.
- Area loads: shaded polygon with a grid of small arrows; the varying ones show changing arrow length.
- Line loads: a row of arrows with an outline showing the shape.
- Point loads: one large arrow with its value.
- Moments: a curved arrow.
- Toggle each pattern on or off. Scale arrows to magnitude, with a minimum visible size.
- Clicking a load opens its properties and highlights every member it reaches.

## 8. Engine requirements for load shapes

- Equivalent nodal loads for any line load shape by Gauss integration of the shape functions (at least 5 points per element). Do not hard-code formulas per shape.
- Split elements at every point load, moment and load discontinuity, so diagrams show the real kinks and jumps.
- Diagrams sample at least 100 points per span, plus every discontinuity.
- Each shape needs its own closed-form tests. See `ACCEPTANCE_TESTS.md`.
