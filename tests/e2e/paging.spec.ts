import { type Page, expect, test } from "@playwright/test";
import { buildPlainPdf } from "../fixtures";
import { darkPixels, openPdf, pageCanvas, viewportPoint } from "./harness";

/** Where `buildPlainPdf` prints each page's heading. */
const HEADING = { x: 68, y: 736, width: 130, height: 24 };
const BLANK = { x: 200, y: 400, width: 200, height: 40 };

/** Wheels the document along in steps, so every page in between really does come into view. */
async function scrollThrough(page: Page, distance: number, steps = 40): Promise<void> {
  for (let step = 0; step < steps; step += 1) {
    await page.mouse.wheel(0, distance / steps);
    await page.waitForTimeout(30);
  }
}

function canvasesHeld(page: Page): Promise<{ canvases: number; megabytes: number }> {
  return page.evaluate(() => {
    const held = [...document.querySelectorAll("canvas[data-page]")] as HTMLCanvasElement[];
    const pixels = held.reduce((sum, canvas) => sum + canvas.width * canvas.height, 0);
    return { canvases: held.length, megabytes: Math.round((pixels * 4) / 1e6) };
  });
}

test("a long document does not hoard the pages it has been scrolled past", async ({ page }) => {
  test.setTimeout(90_000);
  await openPdf(page, await buildPlainPdf(40));
  await scrollThrough(page, 60_000, 45);

  const held = await canvasesHeld(page);
  expect(held.canvases).toBeLessThan(10);
  expect(held.megabytes).toBeLessThan(50);

  await expect(pageCanvas(page, 40)).toBeVisible();
  expect(await darkPixels(page, HEADING, 40)).toBeGreaterThan(50);
});

test("a page let go of on the way down is painted again on the way back", async ({ page }) => {
  test.setTimeout(90_000);
  await openPdf(page, await buildPlainPdf(10));
  await expect(pageCanvas(page, 1)).toBeVisible();

  await scrollThrough(page, 14_000);
  await expect(pageCanvas(page, 1)).toHaveCount(0);

  await scrollThrough(page, -14_000);
  await expect(pageCanvas(page, 1)).toBeVisible();
  expect(await darkPixels(page, HEADING, 1)).toBeGreaterThan(50);
});

test("marks are still on a page that was let go of and painted again", async ({ page }) => {
  test.setTimeout(90_000);
  await openPdf(page, await buildPlainPdf(10));
  await page.locator('[data-tool="draw"]').click();
  const from = await viewportPoint(page, { x: 210, y: 420 });
  const to = await viewportPoint(page, { x: 380, y: 420 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => darkPixels(page, BLANK)).toBeGreaterThan(50);

  await scrollThrough(page, 14_000);
  await expect(pageCanvas(page, 1)).toHaveCount(0);
  await scrollThrough(page, -14_000);

  await expect(pageCanvas(page, 1)).toBeVisible();
  await expect.poll(() => darkPixels(page, BLANK)).toBeGreaterThan(50);
});
