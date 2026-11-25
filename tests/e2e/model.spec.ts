// Milestone 2 end-to-end tests in a real browser (see docs/ACCEPTANCE_TESTS.md).
import { expect, test, type Page } from '@playwright/test';

type P = { x: number; y: number };
const model = (page: Page) => page.evaluate(() => (window as any).__spanwise.getState());

/** Each test runs in a new browser context, so browser storage starts empty. Wait until the autosave check is done. */
async function freshModel(page: Page) {
  await page.goto('/#model');
  await page.waitForFunction(() => (window as any).__spanwiseReady === true);
  await expect(page.getByTestId('plan')).toBeVisible();
  expect((await model(page)).project.elements.length).toBe(0);
}

async function drawRectByTyping(page: Page, a: string, b: string) {
  await page.getByTestId('tool-wall').click();
  const box = (await page.getByTestId('plan').boundingBox())!;
  const s = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.7 };
  await page.mouse.click(s.x, s.y);
  const dirs: [string, P][] = [
    [a, { x: 200, y: 0 }],
    [b, { x: 0, y: -200 }],
    [a, { x: -200, y: 0 }],
    [b, { x: 0, y: 200 }],
  ];
  for (const [len, d] of dirs) {
    const st = await model(page);
    const walls = st.project.elements.filter((e: any) => e.kind === 'wall');
    // Move the cursor in the wanted direction from the current chain point (screen space).
    const plan = page.getByTestId('plan');
    const scale = Number(await plan.getAttribute('data-scale'));
    const cx = Number(await plan.getAttribute('data-cx'));
    const cy = Number(await plan.getAttribute('data-cy'));
    const last = walls.length ? walls[walls.length - 1].b : null;
    const from = last ? { x: box.x + (last.x - cx) * scale + box.width / 2, y: box.y + box.height / 2 - (last.y - cy) * scale } : s;
    await page.mouse.move(from.x + d.x, from.y + d.y);
    await page.keyboard.type(len);
    await expect(page.getByTestId('typed-preview')).toContainText('mm');
    await page.keyboard.press('Enter');
  }
  await page.keyboard.press('Escape');
}

test('workspaces and disclaimer', async ({ page }) => {
  await freshModel(page);
  await expect(page.locator('.banner')).toHaveText('Not for construction until reviewed and sealed by a licensed engineer.');
  for (const w of ['project', 'loads', 'engine']) {
    await page.goto(`/#${w}`);
    await expect(page.locator('.banner')).toBeVisible();
  }
});

for (const [name, a, b, ea, eb] of [
  ['metric', '8000', '6000', 8000, 6000],
  ['ft-in', `26'-3"`, `19'-8 1/4"`, 8001, 6000.75],
] as const) {
  test(`M2-A: rectangle by typed lengths closes within 1 mm (${name})`, async ({ page }) => {
    await freshModel(page);
    await drawRectByTyping(page, a, b);
    const st = await model(page);
    const walls = st.project.elements.filter((e: any) => e.kind === 'wall');
    expect(walls.length).toBe(4);
    const L = (w: any) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    expect(L(walls[0])).toBeCloseTo(ea, 6);
    expect(L(walls[1])).toBeCloseTo(eb, 6);
    const gap = Math.hypot(walls[3].b.x - walls[0].a.x, walls[3].b.y - walls[0].a.y);
    expect(gap).toBeLessThan(1);
  });
}

test('M2-E: confirm, move a wall, undo: stays unconfirmed', async ({ page }) => {
  await freshModel(page);
  await drawRectByTyping(page, '8000', '6000');
  await page.getByTestId('confirm').click();
  await page.getByTestId('confirm-yes').click();
  await expect(page.getByTestId('gate')).toHaveText('MODEL CONFIRMED');
  await page.getByTestId('tool-select').click();
  const box = (await page.getByTestId('plan').boundingBox())!;
  const wall = page.locator('[data-kind="wall"] polygon').first();
  const wb = (await wall.boundingBox())!;
  await page.mouse.move(wb.x + wb.width / 2, wb.y + wb.height / 2);
  await page.mouse.down();
  await page.mouse.move(wb.x + wb.width / 2 + 40, wb.y + wb.height / 2 + 5, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('gate')).toHaveText('MODEL UNCONFIRMED');
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('gate')).toHaveText('MODEL UNCONFIRMED');
  expect(box.width).toBeGreaterThan(0);
});

test('M2-F: click a beam in 3D shows its section, length, level and status', async ({ page }) => {
  await freshModel(page);
  await page.getByTestId('tool-beam').click();
  const box = (await page.getByTestId('plan').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await page.keyboard.type('4200');
  await page.keyboard.press('Enter');
  await page.getByTestId('tool-select').click();
  await page.getByTestId('view-3d').click();
  const canvas = page.locator('[data-testid="viewer3d"] canvas');
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(1500); // camera transition
  const cb = (await canvas.boundingBox())!;
  const id = (await model(page)).project.elements[0].id;
  const at = await page.evaluate((i) => (window as any).__spanwise3d(i), id);
  await page.mouse.click(cb.x + at.x, cb.y + at.y);
  const panel = page.getByTestId('member-panel');
  await expect(panel).toContainText('B1');
  await expect(panel).toContainText('beam');
  await expect(panel).toContainText('ASSUMED');
  await expect(panel).toContainText('Ground floor');
  await expect(panel).toContainText('4.200 m');
  await expect(panel.getByLabel('Section size')).toHaveValue('2x10');
});

test('M2-L: bare number uses the project unit and shows the converted value before accepting', async ({ page }) => {
  await freshModel(page);
  await page.goto('/#project');
  await page.locator('#def-bare').selectOption('m');
  await page.goto('/#model');
  await page.getByTestId('tool-beam').click();
  const box = (await page.getByTestId('plan').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await page.keyboard.type('3.81');
  await expect(page.getByTestId('typed-preview')).toContainText('3810 mm (bare number read as m)');
  expect((await model(page)).project.elements.length).toBe(0); // nothing placed before Enter
  await page.keyboard.press('Enter');
  const b = (await model(page)).project.elements[0];
  expect(Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y)).toBeCloseTo(3810, 6);
});

test('M2-J and send to Engine test', async ({ page }) => {
  await freshModel(page);
  await drawRectByTyping(page, '8000', '6000');
  await page.getByTestId('tool-opening').click();
  const wall = page.locator('[data-kind="wall"] polygon').first();
  const wb = (await wall.boundingBox())!;
  await page.mouse.click(wb.x + wb.width * 0.3, wb.y + wb.height / 2);
  await expect(page.getByTestId('new-opening')).toBeVisible();
  await page.getByTestId('op-width').fill(`3'-0"`);
  await expect(page.getByTestId('op-width-preview')).toContainText('914.4 mm');
  await page.getByTestId('op-width').press('Enter');
  await page.getByRole('button', { name: 'Add opening' }).click();
  const st = await model(page);
  const header = st.project.elements.find((e: any) => e.kind === 'beam' && e.role === 'header');
  expect(header.status).toBe('assumed');
  expect(header.section).toEqual({ species: 'SPF No.1/No.2', size: '2x10', plies: 2 });
  // Select the header in the plan and send it to the Engine test page.
  await page.getByTestId('tool-select').click();
  const hb = (await page.locator(`[data-id="${header.id}"] polygon`).boundingBox())!;
  await page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await expect(page.getByTestId('member-panel').locator('h2')).toContainText(`${header.label} header`);
  await page.getByTestId('send-to-engine').click();
  await expect(page).toHaveURL(/#engine/);
  await expect(page.locator('main.m1 input[type="number"]').first()).toHaveValue('0.99');
  await expect(page.getByText('Span and section sent from the model')).toBeVisible();
});
