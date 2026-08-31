import { expect, test } from "@playwright/test";
import { buildPlainPdf } from "../fixtures";
import {
  browserZoom,
  centerOf,
  darkPixels,
  openPdf,
  pageCanvas,
  sharpPart,
  sharpness,
  viewportPoint,
  wheelZoom,
  widthOnScreen,
} from "./harness";

/** Where `buildPlainPdf` prints its heading, and a bare strip above it with nothing on it. */
const HEADING = { x: 68, y: 736, width: 130, height: 24 };
const MARGIN = { x: 30, y: 760, width: 110, height: 24 };

test("ctrl and the wheel bring the page closer, and take it back again", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  const fitted = await widthOnScreen(pageCanvas(page));

  await wheelZoom(page, { x: 640, y: 300 }, 4);
  const closer = await widthOnScreen(pageCanvas(page));
  expect(closer).toBeGreaterThan(fitted * 2);

  await wheelZoom(page, { x: 640, y: 300 }, 4, 120);
  expect(await widthOnScreen(pageCanvas(page))).toBeCloseTo(fitted, 0);
});

test("wheeling the other way pulls the whole page back from the window", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  const window = page.viewportSize()!;
  expect((await pageCanvas(page).boundingBox())!.height).toBeGreaterThan(window.height);

  await wheelZoom(page, { x: 640, y: 300 }, 6, 120);
  const sheet = (await pageCanvas(page).boundingBox())!;
  expect(sheet.height).toBeLessThan(window.height);
  expect(sheet.x).toBeGreaterThan(0);
});

test("the browser is not zoomed alongside the page", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await wheelZoom(page, { x: 640, y: 300 }, 6);
  expect(await browserZoom(page)).toBe(1);
});

test("plain scrolling still scrolls", async ({ page }) => {
  await openPdf(page, await buildPlainPdf(3));
  const fitted = await widthOnScreen(pageCanvas(page));
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => document.querySelector(".overflow-auto")!.scrollTop)).toBeGreaterThan(0);
  expect(await widthOnScreen(pageCanvas(page))).toBe(fitted);
});

test("what is under the cursor stays under it", async ({ page }) => {
  await openPdf(page, await buildPlainPdf(3));
  // Far enough in that the pages already fill the window, where a corner is the scroll's to place.
  await wheelZoom(page, { x: 640, y: 300 }, 3);

  const spot = { x: 300, y: 600 };
  const before = await viewportPoint(page, spot);
  await wheelZoom(page, before, 3);
  const after = await viewportPoint(page, spot);

  expect(Math.abs(after.x - before.x)).toBeLessThan(12);
  expect(Math.abs(after.y - before.y)).toBeLessThan(12);
});

test("a page zoomed right in is painted at the size it is shown, not stretched", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  const heading = await viewportPoint(page, centerOf(HEADING));
  await wheelZoom(page, heading, 10);

  // The whole page at this size would be more pixels than one canvas can hold, so it is coarse.
  expect(await sharpness(pageCanvas(page))).toBeLessThan(1);

  await sharpPart(page).waitFor();
  await expect.poll(() => sharpness(sharpPart(page))).toBeGreaterThanOrEqual(1);
  // And what it is holding is the page, painted where the page is: the heading, under the cursor.
  const ink = await sharpPart(page).evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    let dark = 0;
    for (let index = 0; index < data.length; index += 4) if (data[index]! < 128) dark += 1;
    return dark;
  });
  expect(ink).toBeGreaterThan(500);
});

test("the sharp painting follows the page as it is scrolled", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await wheelZoom(page, { x: 640, y: 300 }, 10);
  await sharpPart(page).waitFor();

  await page.mouse.wheel(0, 2000);
  await expect.poll(async () => (await sharpPart(page).boundingBox())?.y ?? 0).toBeLessThan(0);
  await expect.poll(async () => {
    const part = (await sharpPart(page).boundingBox())!;
    return part.y + part.height;
  }).toBeGreaterThan(page.viewportSize()!.height);
});

test("the toolbar stays on the screen however far the page is zoomed", async ({ page }) => {
  await openPdf(page, await buildPlainPdf(3));
  await wheelZoom(page, { x: 640, y: 300 }, 12);
  const window = page.viewportSize()!;
  const toolbar = (await page.locator('[data-action="save"]').boundingBox())!;
  expect(toolbar.y).toBeGreaterThan(window.height / 2);
  expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(window.height);
  expect(toolbar.x).toBeGreaterThanOrEqual(0);
  await expect(page.locator('[data-action="save"]')).toBeVisible();
});

test("the pen draws where it is put when the page is zoomed in", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await wheelZoom(page, { x: 640, y: 300 }, 4);
  await page.evaluate(() => document.querySelector(".overflow-auto")!.scrollTo(0, 0));
  await page.locator('[data-tool="draw"]').click();

  const from = await viewportPoint(page, { x: 40, y: 770 });
  const to = await viewportPoint(page, { x: 120, y: 770 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();

  await expect.poll(() => darkPixels(page, MARGIN)).toBeGreaterThan(50);
});
