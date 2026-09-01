import { expect, test } from "@playwright/test";
import { buildPlainPdf } from "../fixtures";
import { readPathCorners } from "../verify";
import { darkPixels, openPdf, savePdf, viewportPoint } from "./harness";

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

/** Where a drawn line ends up once it has been carried a hundred points left and forty down. */
const MOVED = { x: 100, y: 360, width: 200, height: 40 };

/** Draws a line, puts the pen away, and takes hold of the line again. */
async function drawAndSelect(page: import("@playwright/test").Page): Promise<void> {
  await openPdf(page, await buildPlainPdf());
  await page.locator('[data-tool="draw"]').click();
  await dragAcrossBlankArea(page);
  await page.locator('[data-tool="draw"]').click();
  const on = await viewportPoint(page, { x: 300, y: 420 });
  await page.mouse.click(on.x, on.y);
  await page.locator('[data-testid="mark-selection"]').waitFor();
}

test("clicking a drawn line takes hold of it", async ({ page }) => {
  await drawAndSelect(page);
  await expect(page.locator('[data-testid="remove-mark"]')).toBeVisible();
});

test("clicking the paper beside a line lets go of it", async ({ page }) => {
  await drawAndSelect(page);
  const away = await viewportPoint(page, { x: 450, y: 600 });
  await page.mouse.click(away.x, away.y);
  await expect(page.locator('[data-testid="mark-selection"]')).toHaveCount(0);
});

test("the paper inside a line's box is still paper", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await page.locator('[data-tool="draw"]').click();
  // A diagonal, whose box holds a great deal of page it never touches.
  const from = await viewportPoint(page, { x: 210, y: 500 });
  const to = await viewportPoint(page, { x: 380, y: 340 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await page.locator('[data-tool="draw"]').click();
  const corner = await viewportPoint(page, { x: 370, y: 490 });
  await page.mouse.click(corner.x, corner.y);
  await expect(page.locator('[data-testid="mark-selection"]')).toHaveCount(0);
});

test("the X takes the line off the page", async ({ page }) => {
  await drawAndSelect(page);
  await page.locator('[data-testid="remove-mark"]').click();
  await expect(page.locator('[data-testid="mark-selection"]')).toHaveCount(0);
  await expect.poll(() => darkPixels(page, BLANK)).toBe(0);
});

test("Delete takes the line off the page", async ({ page }) => {
  await drawAndSelect(page);
  await page.keyboard.press("Delete");
  await expect(page.locator('[data-testid="mark-selection"]')).toHaveCount(0);
  await expect.poll(() => darkPixels(page, BLANK)).toBe(0);
});

test("Escape lets go of the line without taking it away", async ({ page }) => {
  await drawAndSelect(page);
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-testid="mark-selection"]')).toHaveCount(0);
  expect(await darkPixels(page, BLANK)).toBeGreaterThan(50);
});

test("dragging a line carries it, on the page and into the saved file", async ({ page }) => {
  await drawAndSelect(page);
  const from = await viewportPoint(page, { x: 300, y: 420 });
  const to = await viewportPoint(page, { x: 200, y: 380 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => darkPixels(page, BLANK)).toBe(0);
  await expect.poll(() => darkPixels(page, MOVED)).toBeGreaterThan(50);
  // Where the line began, less the hundred points it was carried, give or take a pixel of pointing.
  const corners = await readPathCorners(await savePdf(page));
  expect(corners[0]!.x).toBeGreaterThan(108);
  expect(corners[0]!.x).toBeLessThan(112);
});

test("a line is carried by the press that takes hold of it, in one motion", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await page.locator('[data-tool="draw"]').click();
  await dragAcrossBlankArea(page);
  await page.locator('[data-tool="draw"]').click();
  const from = await viewportPoint(page, { x: 300, y: 420 });
  const to = await viewportPoint(page, { x: 200, y: 380 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => darkPixels(page, BLANK)).toBe(0);
  await expect.poll(() => darkPixels(page, MOVED)).toBeGreaterThan(50);
});

test("undo puts a carried line back where it was", async ({ page }) => {
  await drawAndSelect(page);
  const from = await viewportPoint(page, { x: 300, y: 420 });
  const to = await viewportPoint(page, { x: 200, y: 380 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => darkPixels(page, MOVED)).toBeGreaterThan(50);
  await page.locator('[data-action="undo"]').click();
  await expect.poll(() => darkPixels(page, BLANK)).toBeGreaterThan(50);
  await expect.poll(() => darkPixels(page, MOVED)).toBe(0);
});

test("a line dragged off the edge is kept on the page", async ({ page }) => {
  await drawAndSelect(page);
  const from = await viewportPoint(page, { x: 300, y: 420 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(4, from.y, { steps: 10 });
  await page.mouse.up();
  // Stopped with the whole line on the paper: the ink itself, and the width the pen laid it at.
  const corners = await readPathCorners(await savePdf(page));
  expect(corners[0]!.x).toBeGreaterThanOrEqual(0);
  expect(corners[0]!.x).toBeLessThan(5);
});

test("the pen draws over a line rather than taking hold of it", async ({ page }) => {
  await drawAndSelect(page);
  await page.locator('[data-tool="draw"]').click();
  await expect(page.locator('[data-testid="mark-selection"]')).toHaveCount(0);
  const on = await viewportPoint(page, { x: 300, y: 420 });
  await page.mouse.click(on.x, on.y);
  await expect(page.locator('[data-testid="mark-selection"]')).toHaveCount(0);
});
