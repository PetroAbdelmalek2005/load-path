# First message to paste into Claude Code

Copy everything between the lines below into Claude Code, opened in this folder.

---

You are starting a new project called Load Path. Read these files fully before you do anything else:

1. `CLAUDE.md` (project rules; follow them in every session)
2. `docs/PRODUCT_OUTLINE.md` (the full vision)
3. `docs/LOADS_SPEC.md` (load types, shapes, distribution)
4. `docs/ACCEPTANCE_TESTS.md` (tests that define "correct")
5. `docs/CODE_VALUES_SEED.json` (code values, all unverified)
6. `reference/engine.js` (an old prototype; reference only)

Then do the following, in order, and stop after step 4:

1. Summarise the product back to me in 10 lines or fewer, so I can confirm you understood it.
2. List every question you have, grouped as engineering questions and software questions. Do not guess engineering values.
3. Propose the plan for Milestone 1 (Engine core): files to create, the order you will build them, and which acceptance tests each step makes pass.
4. Tell me what I need to install on my computer to run this project, one step at a time. I do not code. Assume I have never used a terminal.

Do not write any code until I approve the Milestone 1 plan.

Milestone 1 scope reminder: set up the project, load the code values from JSON, build the 1D direct stiffness member solver with every load shape in LOADS_SPEC.md section 2, the combination engine with pattern live loading, all wood checks, and pass acceptance tests A to L and N. Add one simple test page that runs a single member and shows its diagrams. No 3D yet.

---

## Later milestone prompts

Use one of these when the previous milestone is done and tested.

- **Milestone 2:** "Start Milestone 2 from PRODUCT_OUTLINE.md section 11. Plan first, then wait for my approval."
- **Milestone 3 to 8:** the same sentence with the new number.

## When something looks wrong

Tell Claude Code exactly what you saw and what you expected, with numbers. For example: "Test case: 3.6 m beam, I expected Mf = 22.50 kN·m and the app shows 24.1. Find the cause, add a failing test first, then fix it."
