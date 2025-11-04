import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4173/static/react/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Tabular ML studio' }).click();
  await page.waitForSelector('.preview-table tbody tr');
  await page.getByRole('button', { name: 'Fit preprocessing' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Compute mask' }).click();
  await page.waitForTimeout(500);
  const histogramForm = page.locator('form', { hasText: 'Histogram' }).first();
  await histogramForm.scrollIntoViewIfNeeded();
  await histogramForm.getByRole('combobox', { name: 'Column' }).selectOption('Age');
  await histogramForm.getByRole('button', { name: 'Render histogram' }).click();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Train model' }).click();
  await page.waitForSelector('.tabular-metrics dd', { timeout: 60000 });
  await page.getByRole('button', { name: 'Refresh metrics' }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'tabular_ml_overview.png', fullPage: true });
  await browser.close();
})();
