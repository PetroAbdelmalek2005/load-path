# Code values to verify

Generated from `src/data/code-values.json` by `npm run verify-list`. Do not edit by hand.

34 of 34 values still need verification.

To verify one: check it against the purchased document, then tell Claude the key, the confirmed value and the date. Claude sets verified = true, verifiedBy and verifiedDate.

## Not yet verified

| Key | Value | Units | Source | Note |
| --- | --- | --- | --- | --- |
| `loads.liveResidential` | 1.9 | kPa | 2024 OBC (O. Reg. 163/24) Div. B, Table 4.1.5.3 (edition: to confirm) | Floor live load inside dwelling units |
| `loads.liveOtherOccupancies` | **missing** | kPa | 2024 OBC (O. Reg. 163/24) Div. B, Table 4.1.5.3 (edition: to confirm) | Fill in: attics, balconies, garages, decks as needed |
| `loads.woodDensity` | 5 | kN/m3 | Assumption, n/a (edition: to confirm) | Self-weight of sawn lumber; conservative assumption, not a code value |
| `snow.Cb_default` | 0.8 | - | 2024 OBC (O. Reg. 163/24) Div. B, 4.1.6.2 (edition: to confirm) | Basic roof snow factor for typical small roofs; check the larger-roof rule |
| `snow.Cw_default` | 1 | - | 2024 OBC (O. Reg. 163/24) Div. B, 4.1.6.2 (edition: to confirm) | Wind exposure factor; reduced value allowed only for exposed sites |
| `snow.Ca_default` | 1 | - | 2024 OBC (O. Reg. 163/24) Div. B, 4.1.6.2 (edition: to confirm) | Shape factor; drifts and steps use other values |
| `snow.Cs_rule` | flatUpToDeg: 30<br>zeroAtDeg: 70<br>formula: (70 - slope)/40 between limits | - | 2024 OBC (O. Reg. 163/24) Div. B, 4.1.6.2 (edition: to confirm) | Slope factor for non-slippery roofs; slippery roofs differ |
| `snow.Is_ULS_normal` | 1 | - | 2024 OBC (O. Reg. 163/24) Div. B, Table 4.1.6.2.-A (edition: to confirm) | Importance factor, normal importance, strength |
| `snow.Is_SLS_normal` | 0.9 | - | 2024 OBC (O. Reg. 163/24) Div. B, Table 4.1.6.2.-A (edition: to confirm) | Importance factor, normal importance, serviceability |
| `snow.climateByMunicipality` | **empty** | kPa | 2024 OBC (O. Reg. 163/24) Div. B, Climatic data (SB-1) (edition: to confirm) | Fill in Ss and Sr per municipality served |
| `combinations` | 1.4D<br>1.25D + 1.5L + 1.0S<br>1.25D + 1.5S + 0.5L<br>0.9D + 1.5L + 1.0S<br>0.9D + 1.5S + 0.5L | - | 2024 OBC (O. Reg. 163/24) Div. B, Table 4.1.3.2.-A (edition: to confirm) | Gravity cases only. Companion factors (1.0S, 0.5L) are the least certain values here. 0.9D cases matter for uplift and cantilevers. Wind and earthquake cases added later. |
| `loadDuration.standard` | 1 | - | CSA O86, 5.3.2 (edition: to confirm) | Standard term |
| `loadDuration.permanent` | 0.65 | - | CSA O86, 5.3.2 (edition: to confirm) | Permanent, dead load only |
| `loadDuration.deadDominantFormula` | a: 1<br>b: 0.5<br>min: 0.65 | - | CSA O86, 5.3.2 (edition: to confirm) | KD = a - b*log10(PL/PS), not less than min, when PL > PS |
| `resistanceFactors.bending` | 0.9 | - | CSA O86, 6.5.4.1 (edition: to confirm) | Sawn lumber bending |
| `resistanceFactors.shear` | 0.9 | - | CSA O86, 6.5.5.2 (edition: to confirm) | Sawn lumber shear |
| `resistanceFactors.compressionParallel` | 0.8 | - | CSA O86, 6.5.6.2 (edition: to confirm) | Columns |
| `resistanceFactors.bearing` | 0.8 | - | CSA O86, 6.5.7 (edition: to confirm) | Compression perpendicular to grain |
| `sawnLumber.plyThickness` | 38 | mm | CSA O141, dressed sizes (edition: to confirm) | Dressed thickness of 2x lumber |
| `sawnLumber.depths` | 2x4: 89<br>2x6: 140<br>2x8: 184<br>2x10: 235<br>2x12: 286 | mm | CSA O141, dressed sizes (edition: to confirm) | Dressed depths |
| `sawnLumber.specifiedStrengths` | SPF No.1/No.2: {"fb":11.8,"fv":1.5,"fc":11.5,"fcp":5.3,"E":9500,"E05":6500}<br>SPF Select Structural: {"fb":16.5,"fv":1.5,"fc":14.5,"fcp":5.3,"E":10500,"E05":7500}<br>D.Fir-L No.1/No.2: {"fb":11,"fv":1.9,"fc":14,"fcp":7,"E":11000,"E05":7000}<br>D.Fir-L Select Structural: {"fb":16.5,"fv":1.9,"fc":19,"fcp":7,"E":12500,"E05":8500} | MPa | CSA O86, Table 6.3.1A (edition: to confirm) | Structural joists and planks / light framing grades; confirm category and every number |
| `sawnLumber.sizeFactorBendingShear` | 89: 1.7<br>114: 1.5<br>140: 1.4<br>184: 1.2<br>235: 1.1<br>286: 1 | - | CSA O86, Table 6.4.5 (edition: to confirm) | KZb and KZv by depth in mm |
| `sawnLumber.systemFactorBuiltUp` | 1 | - | CSA O86, Table 6.4.4 (edition: to confirm) | Placeholder 1.0 = no credit. Confirm KH for nailed 2-ply and 3-ply beams |
| `sawnLumber.columnSizeFactor` | coefficient: 6.3<br>exponent: -0.13<br>max: 1.3 | - | CSA O86, 6.5.6.2 (edition: to confirm) | KZc = 6.3 (d L)^-0.13 <= 1.3, d and L in mm |
| `sawnLumber.columnStabilityConstant` | 35 | - | CSA O86, 6.5.6.2 (edition: to confirm) | Constant in KC expression |
| `sawnLumber.columnSlendernessMax` | 50 | - | CSA O86, 6.5.6.2 (edition: to confirm) | Cc limit |
| `sawnLumber.builtUpColumnFactor` | 0.6 | - | CSA O86, 6.5.6.4 (edition: to confirm) | PLACEHOLDER. Confirm the real rule for nailed built-up columns |
| `sawnLumber.bearingFactorKB` | 1 | - | CSA O86, 6.5.7 (to confirm) (edition: to confirm) | Bearing factor KB. 1.0 = no credit for bearing length; conservative per Baher 2026-11-23 |
| `sawnLumber.bearingSizeFactorKZcp` | 1 | - | CSA O86, 6.5.7 (to confirm) (edition: to confirm) | Size factor for bearing KZcp. 1.0 is conservative per Baher 2026-11-23 |
| `sawnLumber.serviceConditionKS` | fb: 1<br>fv: 1<br>fc: 1<br>fcp: 1<br>E: 1 | - | CSA O86, service condition factor table (to confirm) (edition: to confirm) | Dry service. Wet service needs lower values; the app warns when a member is marked wet or exterior |
| `sawnLumber.treatmentFactorKT` | 1 | - | CSA O86, treatment factor table (to confirm) (edition: to confirm) | Untreated wood |
| `serviceability.deflectionLiveOrSnow` | 360 | span/ | 2024 OBC (O. Reg. 163/24) Div. B, Table 9.4.3.1 / project criteria (edition: to confirm) | Default L/360; engineer may change per project |
| `serviceability.deflectionTotal` | 240 | span/ | Project criteria, n/a (edition: to confirm) | Default L/240 |
| `serviceability.combinations` | liveSnow: {"D":0,"L":1,"S":1}<br>total: {"D":1,"L":1,"S":1} | - | Project criteria, Baher decision 2026-11-23 (edition: to confirm) | Specified-load cases for deflection. Snow uses the SLS importance factor. 1.0L + 1.0S together is conservative |

## Verified

None yet.
