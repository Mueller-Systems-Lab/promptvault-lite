
import { test, expect } from '@playwright/test';

test('real-corpus smoke - paste analyzer', async ({ page }) => {
  // Start from root, check paste analyzer renders
  await page.goto('/');
  // The paste analyzer is in the UI? Try to find paste/prompt elements
  // Use stable DOM assertions; the removed page.accessibility API is not
  // available in current Playwright releases.
  const bodyText = await page.locator('body').innerText();
  console.log(bodyText.slice(0, 2000));
  // Try to find Pasted prompt analyzer component
  await expect(page.locator('body')).toBeVisible();
  // Check no console errors initially
  const errors = [];
  page.on('console', msg => { if (msg.type()==='error') errors.push(msg.text()); });
  // Try to interact with textarea if present
  const textarea = page.locator('textarea').first();
  if (await textarea.count() > 0) {
    await textarea.fill('Test prompt: Du bist ein Experte. Übersetze {{text}} ins Deutsche.');
    // Try to find analyze button
    const btn = page.locator('button', { hasText: /analys/i }).first();
    if (await btn.count() > 0) {
      await btn.click();
      await page.waitForTimeout(1000);
      // Check score appears
      await expect(page.locator('body')).toContainText(/Score|Bewertung/i);
    }
  }
  expect(errors.length).toBeLessThanOrEqual(0);
});
