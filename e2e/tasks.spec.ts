import { expect, test } from '@playwright/test';

const column = (page: import('@playwright/test').Page, name: string) => page.getByRole('region', { name: new RegExp(`^${name}`) });

test('create a task, then move it to In progress with the keyboard only', async ({ page }) => {
  await page.goto('/#/tasks');
  await expect(page.getByRole('heading', { name: 'QA Tasks', level: 1 })).toBeVisible();
  await expect(page.getByText(/\d+ overdue/).first()).toBeVisible();

  await page.getByRole('button', { name: 'New task', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New task', exact: true });
  await dialog.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(dialog.getByText('Add a short title.')).toBeVisible();
  await dialog.getByLabel(/^Title/).fill('Automate the photo mode flow');
  await dialog.getByLabel('Type').selectOption('automation_new');
  await dialog.getByLabel('Owner').selectOption({ label: 'Sam K.' });
  await dialog.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(dialog).toBeHidden();

  const todo = column(page, 'To do');
  await expect(todo.getByRole('button', { name: 'Automate the photo mode flow', exact: true })).toBeVisible();

  const handle = page.getByRole('button', { name: 'Move Automate the photo mode flow', exact: true });
  await handle.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText(/Automate the photo mode flow is over In progress/)).toBeAttached();
  await page.keyboard.press('Space');
  await expect(column(page, 'In progress').getByRole('button', { name: 'Automate the photo mode flow', exact: true })).toBeVisible();
  await expect(todo.getByRole('button', { name: 'Automate the photo mode flow', exact: true })).toHaveCount(0);

  // Pressing Enter on the title opens the task instead of starting a drag.
  await column(page, 'In progress').getByRole('button', { name: 'Automate the photo mode flow', exact: true }).press('Enter');
  const drawer = page.getByRole('dialog', { name: 'Automate the photo mode flow', exact: true });
  await expect(drawer.getByLabel('Status')).toHaveValue('in_progress');
  await drawer.getByLabel('Status').selectOption('done');
  await drawer.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(column(page, 'Done').getByRole('button', { name: 'Automate the photo mode flow', exact: true })).toBeVisible();

  // Saved in the browser: still there after a reload.
  await page.reload();
  await expect(column(page, 'Done').getByRole('button', { name: 'Automate the photo mode flow', exact: true })).toBeVisible();
});

test('drag a card with the mouse into another column', async ({ page }) => {
  await page.goto('/#/tasks');
  const card = page.getByRole('button', { name: 'Move Prepare test plan for 0.8.5', exact: true });
  const target = column(page, 'In review');
  const from = (await card.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y + 30, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height - 20, { steps: 15 });
  await page.mouse.up();
  await expect(target.getByRole('button', { name: 'Prepare test plan for 0.8.5', exact: true })).toBeVisible();
});

test('My tasks filter and List view', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('link', { name: /My open tasks/ }).click();
  await expect(page).toHaveURL(/#\/tasks\?mine=1/);
  await expect(page.getByLabel('My tasks')).toBeChecked();
  await expect(page.getByRole('button', { name: 'Code review meeting: automation pull requests', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Automate the delivery quest flow', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'List', exact: true }).click();
  const table = page.getByRole('table');
  await expect(table.getByRole('columnheader', { name: 'Owner', exact: true })).toBeVisible();
  await page.getByLabel('My tasks').uncheck();
  await expect(table.getByRole('button', { name: 'Automate the delivery quest flow', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Priority', exact: true }).click();
  await expect(table.getByRole('row').nth(1)).toContainText('P1');

  await page.getByLabel('Type').selectOption('meeting');
  await expect(table.getByRole('row')).toHaveCount(3);
});

test('task search, links and phone layout', async ({ page }) => {
  await page.goto('/#/search?q=flaky');
  await expect(page.getByRole('heading', { name: 'QA tasks (1)', exact: true })).toBeVisible();

  await page.goto('/#/tasks');
  await page.getByRole('button', { name: 'Release readiness sync for 0.8.4 hotfix', exact: true }).click();
  await page.getByRole('dialog').getByRole('link', { name: /Hotfix 0.8.4/ }).click();
  await expect(page).toHaveURL(/#\/releases\/rel-084/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/tasks');
  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(pageWidth).toBeLessThanOrEqual(390);
});
