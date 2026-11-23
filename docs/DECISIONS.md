# Decisions Log

Every engineering assumption and design decision, with the reason. Newest at the top.

| Date | Decision | Reason | Revisit when |
| --- | --- | --- | --- |
| 2026-11-23 | Load-set solve uses element nodes only at member ends, supports and load points. Diagrams are sampled at 200 points per span segment by statics. Deflection between nodes uses the exact clamped-element solution | Element nodes are exact for Euler-Bernoulli beams. A fine element mesh made short overhangs ill-conditioned (0.1 % equilibrium error found by Test N) | Never |
| 2026-11-23 | Test page keeps its form in React state, not Zustand | There is no building model yet. Zustand arrives with the model in Milestone 2 | Milestone 2 |
| 2026-11-23 | Pin and roller supports behave the same | Milestone 1 has no axial analysis | Frame analysis (Milestone 8) |
| 2026-11-23 | Location of maximum moment is reported to the nearest sample point (span/200) | Value error is below 0.01 % at that spacing | Never |
| 2026-11-23 | Shear is checked at every sample point, including at the support | Conservative; matches "shear at the support face" | O86 shear clause verified |
| 2026-11-23 | Deflection uses E × KSE × KT (mean E, not E05) | Usual practice for serviceability | O86 verified |
| 2026-11-23 | KH = 1.0 for single members and for posts. Built-up beams use the code value systemFactorBuiltUp (1.0 now) | No system credit until confirmed | O86 Table 6.4.4 verified |
| 2026-11-23 | Point moment sign: counter-clockwise positive (x to the right, y up). Moment diagram: sagging positive, drawn on the tension side | Right-hand rule; Baher's default for diagrams | Never |
| 2026-11-23 | Snow is entered before the importance factor. The engine applies Is(ULS) for strength and KD, and Is(SLS) for deflection. Normal importance only | One input serves both limit states | Other importance categories needed |
| 2026-11-23 | Post self-weight = A × height × density, added to dead load at the base | Baher Q14 | Never |
| 2026-11-23 | One size factor table for KZb and KZv, marked unverified | Baher Q13; Test A assumes equal | O86 Table 6.4.5 verified |
| 2026-11-23 | Section library: 2x4 to 2x12, SPF and D.Fir-L, 1 to 4 plies for beams and posts | Baher Q12. Solid timbers and engineered wood later | Milestone 8 |
| 2026-11-23 | Uplift is not a member failure. It shows a red "Uplift: anchorage required" flag with the force and goes to open items. A report cannot be marked final until the engineer acknowledges it | Baher Q11 | Never |
| 2026-11-23 | KS (per property) and KT are code values, default 1.0 (dry, untreated), editable per member. Warning if marked wet or exterior with dry factors | Baher Q10 | O86 service and treatment factor tables verified |
| 2026-11-23 | KB = 1.0 and KZcp = 1.0 as unverified code values. Default bearing length = supporting element size; if unknown, 89 mm marked assumed. Required bearing length is reported | Baher Q9; 1.0 is conservative for both | O86 6.5.7 verified |
| 2026-11-23 | Bending requires "compression edge braced" (KL = 1.0). If not braced, the check is refused with the reason. Warning when hogging puts the bottom edge in compression | Baher Q8 | O86 6.5.4.2 verified |
| 2026-11-23 | Cantilever deflection: tip deflection against 2 × Lc / 360 (live + snow) and 2 × Lc / 240 (total). Project setting, not a code value | Baher Q7 | Per project |
| 2026-11-23 | Live/snow deflection uses 1.0L + 1.0S together at SLS importance; total uses D + L + S. Both factor sets are code values | Baher Q6; conservative | OBC verified |
| 2026-11-23 | Snow gets the same on/off span patterns as live on continuous members. Live and snow patterns vary independently (full set: up to 64 × 64 cases per combination on 6 spans). Solved by superposition: each span's unit load is solved once per pattern type, then combined. The summary reports the case count and run time | Baher Q5 and follow-up: floor live and roof snow come from different surfaces, so their patterns are independent. Conservative until OBC 4.1.6 partial snow clause is verified | OBC 4.1.6 verified |
| 2026-11-23 | Pattern loading: every on/off combination of span segments (2^n) up to 6 segments. Dead always on all spans. Cantilever overhangs count as segments. The 0.9D combinations run too. Above 6 segments the engine stops and warns | Baher Q4 | Never |
| 2026-11-23 | KD per check from load effects (moment for bending, shear for shear, reaction for bearing and posts) AND from total load; the lower is used and both are shown. Effects are taken at the same section and in the same load case as the governing factored effect, as magnitudes: PL = abs(dead effect), PS = abs(live + Is·snow effect). If the dead and live/snow effects have opposite signs there, KD = 0.65 (permanent): the live/snow load reduces the effect, so what remains is permanent load | Baher Q2 and follow-up: conservative interpretation. Note: when live/snow is larger than dead and opposite in sign, this is more conservative than needed, never unsafe | O86 5.3.2 verified |
| 2026-11-23 | KD uses specified loads. PL = dead. PS = live and snow with a non-zero factor in the combination. Dead alone gives 0.65. KD never above 1.0. Each pattern case uses only the live and snow it contains | Baher Q1 and Q3 | O86 5.3.2 verified |
| 2026-11-23 | No live load reduction by tributary area | Conservative; residential tributary areas are small | Clause verified and a project needs it |
| 2026-11-23 | Shear checked at the support face, not at distance d | Conservative and simple | After O86 shear clause is verified |
| 2026-11-23 | KH = 1.0 for built-up beams | No system factor credit until confirmed | O86 Table 6.4.4 verified |
| 2026-11-23 | Built-up post factor 0.6 of a solid post | Placeholder only | O86 nailed built-up column rule verified |
| 2026-11-23 | Wood self-weight 5.0 kN/m³ | Conservative assumption | Never, unless a product needs its own value |
| 2026-11-23 | Surfaces span one way in early milestones | Matches most joist floors and rafters | Two-way decks or slabs are needed |
| 2026-11-23 | Reactions transfer unfactored, by pattern | Combinations must happen at the member being checked | Never |
