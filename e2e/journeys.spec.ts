import { expect, test, type Page } from '@playwright/test';

const external: string[] = [];
test.beforeEach(async ({ page }) => {
  external.length = 0;
  // Demo mode must never reach a real service.
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.hostname !== 'localhost') external.push(req.url());
  });
});
test.afterEach(() => {
  expect(external, 'no requests leave the demo').toEqual([]);
});

async function fillBug(page: Page, title: string) {
  await page.getByLabel(/^Title/).fill(title);
  await page.getByLabel(/^Severity/).selectOption('high');
  await page.getByLabel(/^Priority/).selectOption('P2');
  await page.getByLabel(/^Steps to reproduce/).fill('1. Open a save.\n2. Go offline and back online.\n3. Open the inventory.');
  await page.getByLabel(/^Expected result/).fill('Inventory stays open.');
  await page.getByLabel(/^Actual result/).fill('Inventory closes immediately.');
}

test('report → review → submit, with inline errors first', async ({ page }) => {
  await page.goto('/#/capture');
  await page.getByRole('button', { name: 'Review & submit' }).click();
  await expect(page.getByText('Add a short title')).toBeVisible();
  await expect(page.getByText('Choose a severity')).toBeVisible();

  await fillBug(page, 'Inventory closes after reconnect');
  await expect(page.locator('.chat-msg')).toContainText('Inventory closes after reconnect');
  await page.getByRole('button', { name: 'Review & submit' }).click();
  const dialog = page.getByRole('dialog', { name: 'Submit this finding?' });
  await expect(dialog).toContainText('Create a ticket in Issue tracker / Bugs');
  await expect(dialog).toContainText('#demo-qa');
  await dialog.getByRole('button', { name: 'Submit' }).click();

  await expect(page.getByRole('heading', { name: /Bug CP-\d+ saved/ })).toBeVisible();
  await expect(page.getByText('Delivered')).toHaveCount(2, { timeout: 5000 });
});

test('chat failure after ticket success retries only the chat delivery', async ({ page }) => {
  await page.goto('/#/capture');
  await fillBug(page, 'Shop closes on reconnect');
  await page.getByText('Demo: simulate a delivery problem').click();
  await page.getByLabel('Next chat post fails').check();
  await page.getByRole('button', { name: 'Review & submit' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();

  await expect(page.getByText('Partially delivered')).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Delivered')).toHaveCount(2, { timeout: 5000 });

  await page.goto('/#/settings');
  // 30 seeded tickets + 1 new one: the retry did not create another ticket.
  await expect(page.getByText(/Mock remote holds \d+ tickets/)).toContainText('holds 31 tickets');
});

test('ambiguous ticket timeout reconciles instead of duplicating', async ({ page }) => {
  await page.goto('/#/capture');
  await fillBug(page, 'Timeout case');
  await page.getByText('Demo: simulate a delivery problem').click();
  await page.getByLabel('Next ticket times out (but is created)').check();
  await page.getByRole('button', { name: 'Review & submit' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Uncertain · check before resending')).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: 'Check & retry' }).click();
  await expect(page.getByText(/Found the earlier request/)).toBeVisible();
  await page.goto('/#/settings');
  await expect(page.getByText(/Mock remote holds/)).toContainText('holds 31 tickets');
});

test('failed run case → linked bug', async ({ page }) => {
  await page.goto('/#/test-lab/runs/run-hotfix');
  await page.getByRole('button', { name: 'Text fits in harvest summary (all languages)' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Failed').check();
  await drawer.getByLabel(/^Notes/).fill('German text overflows the summary box.');
  await drawer.getByRole('button', { name: 'Save result' }).click();
  await drawer.getByRole('button', { name: 'Report a bug from this failure' }).click();

  await expect(page).toHaveURL(/#\/capture/);
  await expect(page.getByLabel(/^Actual result/)).toHaveValue('German text overflows the summary box.');
  await page.getByLabel(/^Severity/).selectOption('medium');
  await page.getByLabel(/^Priority/).selectOption('P3');
  await page.getByRole('button', { name: 'Review & submit' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
  const heading = await page.getByRole('heading', { name: /Bug CP-\d+ saved/ }).textContent();
  const id = heading!.match(/CP-\d+/)![0];

  await page.goto('/#/test-lab/runs/run-hotfix');
  const row = page.getByRole('row', { name: /Text fits in harvest summary/ });
  await expect(row).toContainText('Failed');
  await expect(row).toContainText(id);
});

test('digest: partial fetch is refused, partial send resumes', async ({ page }) => {
  await page.goto('/#/triage/digest');
  await page.getByLabel('Demo: fail page 2 of the next fetch').check();
  await page.getByRole('button', { name: 'Fetch open bugs' }).click();
  await expect(page.getByText(/Partial fetch/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prepare message preview' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Fetch again' }).click();
  await expect(page.getByText(/Fetched \d+ pages/)).toBeVisible();
  await expect(page.getByRole('row', { name: /Total/ })).toContainText('24');
  await expect(page.getByText(/Needs review \(1\)/)).toBeVisible();

  await page.getByRole('button', { name: 'Prepare message preview' }).click();
  await page.getByLabel('Demo: next chat post fails').check();
  await page.getByRole('button', { name: /Send \d+ messages/ }).click();
  await expect(page.getByText(/Failed: /)).toBeVisible();
  // the parent failed, so nothing was sent; now resume
  await page.getByRole('button', { name: /Send \d+ messages/ }).click();
  await expect(page.getByText(/All \d+ messages sent/)).toBeVisible();
});

test('release: hold decision → frozen message → send', async ({ page }) => {
  await page.goto('/#/releases/rel-084');
  await expect(page.getByText('2 critical bugs unresolved')).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Ready Unavailable/ })).toBeDisabled();
  await expect(page.locator('.chat-msg')).toContainText('HOLD · Orbit Garden 0.8.4 (Hotfix)');
  await expect(page.locator('.chat-msg')).toContainText('42 / 52 passed (80.8% pass rate, 90.4% executed)');
  await page.getByRole('button', { name: 'Save decision' }).click();
  await expect(page.getByText(/saved as revision 1/)).toBeVisible();
  await page.getByRole('button', { name: 'Review message' }).click();
  await page.getByRole('button', { name: 'Send to #demo-releases' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Delivered')).toBeVisible({ timeout: 5000 });

  // New evidence after the decision: the saved message must not change.
  await page.goto('/#/triage/CP-109');
  await page.getByRole('dialog').getByLabel('Status').selectOption('resolved');
  await page.goto('/#/releases/rel-084');
  await page.getByRole('tab', { name: 'Message' }).click();
  await expect(page.getByText(/Evidence has changed/)).toBeVisible();
  await expect(page.locator('.chat-msg')).toContainText('Blockers: CP-104, CP-109');
});

test('refresh keeps changes, reset restores fixtures', async ({ page }) => {
  await page.goto('/#/library');
  await page.getByRole('button', { name: 'Add link' }).click();
  await page.getByLabel(/^Title/).fill('Release checklist');
  await page.getByLabel(/^URL/).fill('javascript:alert(1)');
  await expect(page.getByText('Only http:// and https:// links are allowed.')).toBeVisible();
  await page.getByLabel(/^URL/).fill('https://docs.example.com/checklist');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await page.reload();
  await expect(page.getByText('Release checklist')).toBeVisible();

  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset' }).click();
  await page.goto('/#/library');
  await expect(page.getByText('Release checklist')).toHaveCount(0);
});

test('keyboard: Ctrl+K focuses search and Enter searches', async ({ page }) => {
  await page.goto('/#/');
  await page.keyboard.press('Control+k');
  await expect(page.getByLabel('Search findings, cases, runs and links')).toBeFocused();
  await page.keyboard.type('greenhouse');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /Findings \(/ })).toBeVisible();
});

test('narrow layout: navigation collapses behind a menu button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/');
  await expect(page.getByRole('link', { name: 'Capture' })).not.toBeInViewport();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Capture' }).click();
  await expect(page.getByRole('heading', { name: 'Capture a finding' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('night mode follows the system and can be switched by hand', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/#/');
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(await bg()).toBe('rgb(15, 24, 32)');

  await page.getByRole('button', { name: /^Theme: System/ }).click();
  expect(await bg()).toBe('rgb(246, 247, 245)');
  await page.reload();
  await expect(page.getByRole('button', { name: /^Theme: Light/ })).toBeVisible();
  expect(await bg()).toBe('rgb(246, 247, 245)');

  await page.getByRole('button', { name: /^Theme: Light/ }).click();
  await expect(page.getByRole('button', { name: /^Theme: Dark/ })).toBeVisible();
  expect(await bg()).toBe('rgb(15, 24, 32)');
});
