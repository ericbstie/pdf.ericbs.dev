import { expect, test } from "@playwright/test";
import { buildPlainPdf } from "../fixtures";
import { darkPixels, openPdf, viewportPoint } from "./harness";

const BLANK = { x: 200, y: 400, width: 200, height: 40 };

async function dragAcrossBlankArea(page: import("@playwright/test").Page): Promise<void> {
  const from = await viewportPoint(page, { x: 210, y: 420 });
  const to = await viewportPoint(page, { x: 380, y: 420 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

test("draws along the dragged path", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  expect(await darkPixels(page, BLANK)).toBe(0);
  await page.locator('[data-tool="draw"]').click();
  await dragAcrossBlankArea(page);
  expect(await darkPixels(page, BLANK)).toBeGreaterThan(50);
});

test("leaves the page alone when the pen is not chosen", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await dragAcrossBlankArea(page);
  expect(await darkPixels(page, BLANK)).toBe(0);
});

test("undo takes back the last stroke", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await page.locator('[data-tool="draw"]').click();
  await dragAcrossBlankArea(page);
  expect(await darkPixels(page, BLANK)).toBeGreaterThan(50);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => darkPixels(page, BLANK)).toBe(0);
});
