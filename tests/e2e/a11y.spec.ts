import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const YEAR = fileURLToPath(new URL('../fixtures/synthetic-year.csv', import.meta.url));

async function expectNoViolations(page: Page, where: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // The off-screen 1080×1920 share-image source is aria-hidden and never seen.
    .exclude('[data-testid="share-image"]')
    .analyze();
  expect(violations.map((v) => `${where}: ${v.id} ${v.nodes.map((n) => n.target.join(" ") + " " + (n.failureSummary ?? "")).join(" | ")}`)).toEqual([]);
}

test('a11y_landing_privacy_and_every_card', async ({ page }) => {
  await page.goto('./');
  await expectNoViolations(page, 'landing');

  await page.getByRole('button', { name: 'Privacy & about' }).click();
  await expectNoViolations(page, 'privacy');
  await page.getByRole('button', { name: '← Back' }).click();

  await page.getByTestId('file-input').setInputFiles(YEAR);
  await expect(page.getByRole('heading', { name: 'The number' })).toBeVisible();
  const total = Number((await page.getByTestId('slide-count').textContent())!.split('/')[1]);
  for (let i = 1; i <= total; i++) {
    await expectNoViolations(page, `card ${i}`);
    await page.keyboard.press('ArrowRight');
  }
});

test('a11y_keyboard_only_navigation', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles(YEAR);
  await expect(page.getByRole('heading', { name: 'The number' })).toBeVisible();
  // Tab to the "Next card" control and activate it with Enter.
  const next = page.getByRole('button', { name: 'Next card' });
  for (let i = 0; i < 10 && !(await next.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(next).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Where the money went' })).toBeVisible();
});
