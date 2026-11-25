# Acceptance Tests

Port every test below into Vitest. Tolerance 0.5% unless stated. Tests A to E were checked by hand by Baher's assistant against the prototype in `reference/engine.js`. Tests F to M are standard closed-form results. F and G were also checked by numerical integration.

Shared section for A, B and D: 3-ply 2x10, each ply 38 × 235 mm (b = 114, d = 235). SPF No.1/No.2 with fb 11.8, fv 1.5, fcp 5.3, E 9500, E05 6500 MPa. KZb = KZv = 1.1, KH = 1.0, KS = KT = 1.0, compression edge braced (KL = 1.0). Self-weight at 5.0 kN/m³ = 0.134 kN/m. S = 1,049,275 mm³, I = 123.29 × 10⁶ mm⁴.

## Member design (wood checks)

**Test A.** Simple span 4.0 m. Dead 0.6 kPa × 4.0 m, live 1.9 kPa × 4.0 m.
- 1.25D + 1.5L: wf = 14.567 kN/m, Mf = 29.135 kN·m, Vf = 29.135 kN
- Mr = 12.258 kN·m (KD = 1.0), Vr = 26.522 kN
- 1.4D: Mf = 7.095 kN·m, KD = 0.65, Mr = 7.967 kN·m
- Live load deflection = 21.63 mm

**Test B.** Simple span 3.6 m. Dead 0.6 kPa × 2.5 m, live 1.9 kPa × 2.5 m, dead line load 1.0 kN/m full length, dead point load 5.0 kN at 1.8 m.
- 1.25D + 1.5L: Mf = 22.50 kN·m, Vf = 21.88 kN
- Total specified deflection (D + L) = 17.9 mm
- Specified dead reaction at each end = 7.24 kN

**Test C.** Simple span 4.0 m, point load 10 kN at midspan only. M = 10.0 kN·m. Deflection = PL³/48EI.

**Test D.** Span 4.0 m. Dead 3.0 kPa × 2.0 m (6.0 kN/m) plus self-weight 0.134 kN/m. Live 1.9 kPa × 1.0 m (1.9 kN/m). For 1.25D + 1.5L: KD = 1 − 0.5 log10(6.134 / 1.9) = 0.7455.

**Test E.** Post: 3-ply 2x6 (114 × 140 mm) SPF No.1/No.2, Le = 2.4 m, Fc = 11.5 MPa. Thin axis (d = 114 mm): Cc = 21.05, KZc = 1.237, KC = 0.6315, Pr = 114.7 kN for a solid section, before any built-up reduction. Wide axis (d = 140 mm): Cc = 17.14, Pr = 135.4 kN.

## Load shapes on a simple span

**Test F. Partial uniform load.** L = 6.0 m, w = 5.0 kN/m from x = 0 to x = 3.0 m.
- R1 = 11.25 kN, R2 = 3.75 kN
- Mmax = 12.656 kN·m at x = 2.25 m

**Test G. Triangular load.** L = 6.0 m, w = 0 at x = 0 rising to 6.0 kN/m at x = 6.0 m.
- Total = 18.0 kN, R1 = 6.0 kN, R2 = 12.0 kN
- Mmax = wL²/(9√3) = 13.856 kN·m at x = L/√3 = 3.464 m
- Δmax = 0.00652 wL⁴/EI (w = peak intensity), equal to 0.01304 WL³/EI (W = total load), at x = 0.5193L

**Test H. Trapezoidal load.** Any trapezoid must equal the sum of a uniform load plus a triangular load. Test L = 5.0 m, w1 = 2.0 at x = 0, w2 = 6.0 at x = 5.0: reactions equal (uniform 2.0) + (triangle 0 to 4.0). R1 = 5.0 + 3.333 = 8.333 kN, R2 = 5.0 + 6.667 = 11.667 kN.

**Test I. Point moment.** L = 5.0 m, M0 = 10.0 kN·m at x = 2.0 m. Reactions are 2.0 kN each, equal and opposite. The moment diagram jumps by 10.0 kN·m at x = 2.0 m, with magnitudes 4.0 just left and 6.0 just right.

## Support conditions

**Test J. Cantilever.** L = 2.0 m, uniform w = 3.0 kN/m. Fixed-end moment 6.0 kN·m, shear 6.0 kN, tip deflection wL⁴/8EI.

**Test K. Two equal continuous spans, both loaded.** Each span L, uniform w. Reactions 3wL/8, 10wL/8, 3wL/8. Moment at the middle support = −wL²/8.

**Test L. Two equal continuous spans, one span loaded (pattern load).** Uniform w on span 1 only. R_A = 7wL/16, R_B = 10wL/16, R_C = −wL/16 (uplift). Middle support moment = −wL²/16. Maximum positive moment = 49wL²/512 = 0.0957wL² at 7L/16 from A. The pattern-load engine must find this case and report it as governing for positive moment.

## Load path

**Test M. Floor to foundation.** Self-weight off for this test.
- Floor surface 4.0 m × 3.6 m. Joists span 2.0 m each way from two exterior bearing walls to a central beam 3.6 m long.
- Beam on two posts, one at each end. Posts bear on footings.
- Dead 0.5 kPa, live 1.9 kPa on the whole surface.
- Beam line load: dead 1.0 kN/m, live 3.8 kN/m (tributary 2.0 m).
- Each post: dead 1.8 kN, live 6.84 kN.
- Each exterior wall: dead 1.8 kN, live 6.84 kN in total (0.5 and 1.9 kN/m over 3.6 m).
- Sum of all foundation reactions = 7.2 kN dead and 27.36 kN live, equal to the applied load.

**Test N. Equilibrium on every model.** For any model, the sum of applied loads per pattern must equal the sum of foundation reactions per pattern, within 0.01%. Run this check automatically after every analysis and show a warning if it fails.

## Milestone 2: model and 3D

Approved by Baher 2026-11-25.

**M2-A. Closed rectangle by typed lengths.** Draw four walls by typed lengths, 8.0 m × 6.0 m. They form a closed rectangle within 1 mm. Second run: type 26'-3" × 19'-8 1/4". It also closes within 1 mm.

**M2-B. Undo and redo.** Make 20 edits, including a delete, a level copy and an opening. Undo all, then redo all. The model is deep-equal to the state at each end.

**M2-C. Save round trip.** Save to JSON and reopen. The model is deep-equal, IDs included.

**M2-D. Copy level.** Copy Level 1 up. The new level sits at the correct elevation. Every element is copied with a new ID.

**M2-E. Model gate.** Confirm the model, then move one wall. The model is unconfirmed. Undo the move. The model stays unconfirmed.

**M2-F. Member panel.** Click a beam in 3D. The panel shows its section, length, level and status.

**M2-G. Snapping.** A beam end within the snap distance of a post snaps exactly onto the post.

**M2-H. Open items.** The open-items list shows every assumed element.

**M2-I. File version.** Opening a file with an unknown or older version shows a clear message. The app does not corrupt the file.

**M2-J. Opening header.** Adding an opening creates a header marked assumed, with the default section.

**M2-K. Post length.** Moving the beam above a post updates the post's length automatically.

**M2-L. Bare numbers.** A bare number uses the project's bare-number unit. The converted value appears before it is accepted.
