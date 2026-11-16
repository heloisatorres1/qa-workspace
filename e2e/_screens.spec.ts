import { test } from '@playwright/test';

// Design-review helper: SCREENS=1 SCREENS_DIR=<folder> npx playwright test e2e/_screens.spec.ts
const out = process.env.SCREENS_DIR ?? 'test-results/screens';
const pages: [string, string][] = [
  ['overview', '/'], ['capture', '/capture'], ['triage', '/triage'], ['digest', '/triage/digest'], ['testlab', '/test-lab/runs'],
  ['run', '/test-lab/runs/run-hotfix'], ['release', '/releases/rel-084'], ['library', '/library'], ['settings', '/settings'],
];
for (const [name, path] of pages) {
  test(name, async ({ page }) => {
    await page.goto('/#' + path);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  });
}
test('mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/');
  await page.screenshot({ path: `${out}/mobile.png` });
});
