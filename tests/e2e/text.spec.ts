import { expect, test } from "@playwright/test";
import { buildPlainPdf } from "../fixtures";
import { darkPixels, openPdf, viewportPoint } from "./harness";

const BLANK = { x: 190, y: 380, width: 220, height: 40 };

async function writeAt(page: import("@playwright/test").Page, words: string): Promise<void> {
  await page.locator('[data-tool="text"]').click();
  const point = await viewportPoint(page, { x: 200, y: 400 });
  await page.mouse.click(point.x, point.y);
  await page.locator('[data-testid="text-input"]').waitFor();
  await page.keyboard.type(words);
  await page.keyboard.press("Enter");
}

test("writes where you click", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  expect(await darkPixels(page, BLANK)).toBe(0);
  await writeAt(page, "Paid in full");
  await expect.poll(() => darkPixels(page, BLANK)).toBeGreaterThan(50);
});

test("keeps nothing when you type nothing", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await writeAt(page, "");
  await expect(page.locator('[data-testid="text-input"]')).toHaveCount(0);
  expect(await darkPixels(page, BLANK)).toBe(0);
});
