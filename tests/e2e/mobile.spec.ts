import { devices, expect, test } from "@playwright/test";
import { FLAT_BOXES, buildFlatCheckboxPdf, buildPlainPdf } from "../fixtures";
import { centerOf, darkPixels, openPdf, pageCanvas, touchDrag, viewportPoint } from "./harness";

test.use({ ...devices["Pixel 5"] });

const BLANK = { x: 200, y: 400, width: 200, height: 40 };

async function drawAcrossWithAFinger(page: import("@playwright/test").Page): Promise<void> {
  await page.locator('[data-tool="draw"]').tap();
  const from = await viewportPoint(page, { x: 210, y: 420 });
  const to = await viewportPoint(page, { x: 380, y: 420 });
  await touchDrag(page, from, to);
}

test("the page fits across the phone without sideways scrolling", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  const sheet = (await pageCanvas(page).boundingBox())!;
  const window = page.viewportSize()!;
  expect(sheet.width).toBeLessThanOrEqual(window.width);
  expect(sheet.width).toBeGreaterThan(window.width * 0.9);
  const overflow = await page.evaluate(() => {
    const scroller = document.querySelector(".overflow-auto")!;
    return scroller.scrollWidth - scroller.clientWidth;
  });
  expect(overflow).toBe(0);
});

test("a tap ticks a printed checkbox", async ({ page }) => {
  await openPdf(page, await buildFlatCheckboxPdf());
  const box = FLAT_BOXES[0]!;
  const before = await darkPixels(page, box);
  const point = await viewportPoint(page, centerOf(box));
  await page.touchscreen.tap(point.x, point.y);
  await expect.poll(() => darkPixels(page, box)).toBeGreaterThan(before + 20);
});

test("a finger draws instead of scrolling the page away", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  expect(await darkPixels(page, BLANK)).toBe(0);
  await drawAcrossWithAFinger(page);
  await expect.poll(() => darkPixels(page, BLANK)).toBeGreaterThan(50);
});

test("a finger scrolls the page when the pen is away", async ({ page }) => {
  await openPdf(page, await buildPlainPdf(3));
  const from = await viewportPoint(page, { x: 300, y: 420 });
  await touchDrag(page, from, { x: from.x, y: from.y - 300 }, 20);
  await expect.poll(() => page.evaluate(() => document.querySelector(".overflow-auto")!.scrollTop)).toBeGreaterThan(0);
  expect(await darkPixels(page, BLANK)).toBe(0);
});

test("undo takes back the last stroke without a keyboard", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await drawAcrossWithAFinger(page);
  await expect.poll(() => darkPixels(page, BLANK)).toBeGreaterThan(50);
  await page.locator('[data-action="undo"]').tap();
  await expect.poll(() => darkPixels(page, BLANK)).toBe(0);
});

test("undo is offered only once there is something to take back", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await expect(page.locator('[data-action="undo"]')).toBeDisabled();
  await drawAcrossWithAFinger(page);
  await expect(page.locator('[data-action="undo"]')).toBeEnabled();
});

test("the writing field is too big for the phone to zoom into, yet prints at page size", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await page.locator('[data-tool="text"]').tap();
  const point = await viewportPoint(page, { x: 200, y: 400 });
  await page.touchscreen.tap(point.x, point.y);
  const field = page.locator('[data-testid="text-input"]');
  await field.waitFor();
  const typedSize = await field.evaluate(input => parseFloat(getComputedStyle(input).fontSize));
  expect(typedSize).toBeGreaterThanOrEqual(16);
  const drawn = (await field.boundingBox())!;
  expect(drawn.height).toBeLessThan(16);
});

test("the toolbar sits clear of the last page", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await page.mouse.wheel(0, 20_000);
  const toolbar = (await page.locator('[data-action="save"]').boundingBox())!;
  const sheet = (await pageCanvas(page).boundingBox())!;
  expect(toolbar.y).toBeGreaterThan(sheet.y + sheet.height);
  expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(page.viewportSize()!.height);
});
