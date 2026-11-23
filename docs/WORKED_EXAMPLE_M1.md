# Worked example, Milestone 1 (for a hand check)

Not for construction until reviewed and sealed by a licensed engineer. All code values used here are UNVERIFIED seed values.

This beam is deliberately overloaded, so several checks fail. The point is to check the arithmetic, not the design.

## Inputs

| Item | Value |
| --- | --- |
| Span | 4.2 m simple span. Pin at A (x = 0), roller at B (x = 4.2 m) |
| Section | 2-ply 2x12 SPF No.1/No.2, b = 76 mm, d = 286 mm |
| Bracing | Compression edge braced, KL = 1.0 |
| Bearing | 89 mm at both ends |
| Dead | 0.5 kPa × 3.0 m = 1.5 kN/m, full length |
| Dead point | 4.0 kN at x = 1.5 m |
| Live | 1.9 kPa × 3.0 m = 5.7 kN/m, full length |
| Self-weight | Automatic, 5.0 kN/m³ |
| Factors | φb = φv = 0.9, φcp = 0.8, KH = KS = KT = 1.0, KZ = 1.0 (286 mm) |

To reproduce it on the test page, load "Test B", then change:

- length to 4.2 m, and the B support to 4.2 m
- size to 2x12 and plies to 2
- both bearing lengths to 89 mm
- the two area loads to width 3.0 m and x2 = 4.2 m
- delete the "Wall above" line load
- the point load to 4.0 kN at x = 1.5 m

## Step by step

**1. Section**
- S = b·d²/6 = 76 × 286² / 6 = 1,036,083 mm³
- I = b·d³/12 = 148.16 × 10⁶ mm⁴
- A = 76 × 286 = 21,736 mm²
- Self-weight = 0.021736 m² × 5.0 = 0.1087 kN/m

**2. Specified reactions**
- wD = 1.5 + 0.1087 = 1.6087 kN/m
- RA,D = 1.6087 × 2.1 + 4.0 × 2.7/4.2 = 3.378 + 2.571 = **5.950 kN**
- RB,D = 3.378 + 4.0 × 1.5/4.2 = **4.807 kN**
- RA,L = RB,L = 5.7 × 2.1 = **11.97 kN**

**3. Governing combination: 1.25D + 1.5L**
- wf = 1.25 × 1.6087 + 1.5 × 5.7 = 10.561 kN/m
- Pf = 1.25 × 4.0 = 5.0 kN at 1.5 m
- RA,f = 1.25 × 5.950 + 1.5 × 11.97 = **25.39 kN** (this is also Vf)

**4. Maximum moment**
- Shear is zero where 25.39 − 10.561·x − 5.0 = 0, so x = **1.931 m**
- Mf = 25.39 × 1.931 − 10.561 × 1.931²/2 − 5.0 × (1.931 − 1.5) = **27.19 kN·m**

**5. KD (both methods give 1.0)**
- From moment at x = 1.931 m: PL = 6.76 kN·m (dead), PS = 12.49 kN·m (live). PL < PS, so KD = 1.0.
- From total load: PL = 10.76 kN, PS = 23.94 kN. PL < PS, so KD = 1.0.

**6. Resistances**
- Mr = φ·fb·KD·KH·KS·KT·S·KZ·KL = 0.9 × 11.8 × 1,036,083 × 1.0 / 10⁶ = **11.00 kN·m**
- Vr = φ·fv·(2A/3)·KZ = 0.9 × 1.5 × 14,491 / 1000 = **19.56 kN**
- Qr = φ·fcp·b·lb·KB·KZcp = 0.8 × 5.3 × 76 × 89 / 1000 = **28.68 kN**

**7. Ratios**
| Check | Demand | Resistance | Ratio |
| --- | --- | --- | --- |
| Bending | 27.19 kN·m | 11.00 kN·m | **2.471** (fail) |
| Shear | 25.39 kN | 19.56 kN | **1.298** (fail) |
| Bearing at A | 25.39 kN | 28.68 kN | **0.885** (pass). Required lb = 78.8 mm |
| Bearing at B | 23.96 kN | 28.68 kN | **0.836** (pass) |

**8. Deflection (specified loads)**
- EI = 9500 × 148.16 × 10⁶ N·mm² = 1407.5 kN·m²
- Live: 5·w·L⁴/(384·EI) = 5 × 5.7 × 4.2⁴ / (384 × 1407.5) = **16.41 mm**. Limit L/360 = 11.67 mm. Ratio **1.406** (fail)
- Total D + L: **24.94 mm**, limit L/240 = 17.50 mm. Ratio **1.425** (fail). (The point load makes this a sum of two closed forms.)

## What to compare

Open each check on the test page. The demand, resistance, KD and ratio should match the bold numbers above, within rounding. If one differs, send me the value you expected, the value the page shows, and the check name.
