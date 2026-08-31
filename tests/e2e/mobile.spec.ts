import { devices, expect, test } from "@playwright/test";
import { FLAT_BOXES, buildFlatCheckboxPdf, buildPlainPdf } from "../fixtures";
import {
  browserZoom,
  centerOf,
  countPaintings,
  darkPixels,
  openPdf,
  pageCanvas,
  pdfPointAt,
  pinch,
  pinchAndHold,
  sharpPart,
  sharpness,
  touchDrag,
  viewportPoint,
  widthOnScreen,
} from "./harness";

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

test("a finger takes hold of a writing and carries it, rather than scrolling the page", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await page.locator('[data-tool="text"]').tap();
  const at = await viewportPoint(page, { x: 210, y: 420 });
  await page.touchscreen.tap(at.x, at.y);
  await page.locator('[data-testid="text-input"]').waitFor();
  await page.keyboard.type("Paid in full");
  await page.keyboard.press("Enter");
  await page.locator('[data-tool="text"]').tap();
  await expect.poll(() => darkPixels(page, BLANK)).toBeGreaterThan(50);

  await page.touchscreen.tap(at.x, at.y);
  const box = page.locator('[data-testid="text-selection"]');
  await box.waitFor();
  const scrolled = await page.evaluate(() => document.querySelector(".overflow-auto")!.scrollTop);
  const to = await viewportPoint(page, { x: 210, y: 480 });
  await touchDrag(page, centerOf((await box.boundingBox())!), to);

  await expect.poll(() => darkPixels(page, BLANK)).toBe(0);
  await expect.poll(() => darkPixels(page, { x: 200, y: 460, width: 200, height: 40 })).toBeGreaterThan(50);
  expect(await page.evaluate(() => document.querySelector(".overflow-auto")!.scrollTop)).toBe(scrolled);
});

/** Writes something, puts the tools away, and taps it to take hold of it again. */
async function writeAndHold(page: import("@playwright/test").Page): Promise<{ x: number; y: number }> {
  await openPdf(page, await buildPlainPdf());
  await page.locator('[data-tool="text"]').tap();
  const at = await viewportPoint(page, { x: 210, y: 420 });
  await page.touchscreen.tap(at.x, at.y);
  await page.locator('[data-testid="text-input"]').waitFor();
  await page.keyboard.type("Paid in full");
  await page.keyboard.press("Enter");
  await page.locator('[data-tool="text"]').tap();
  await page.touchscreen.tap(at.x, at.y);
  await page.locator('[data-testid="text-selection"]').waitFor();
  return centerOf((await page.locator('[data-testid="text-selection"]').boundingBox())!);
}

test("a fingertip's own wobble opens a held writing rather than nudging it", async ({ page }) => {
  const held = await writeAndHold(page);
  const before = (await page.locator('[data-testid="text-selection"]').boundingBox())!;
  // No finger lands and lifts on the same pixel, and none of that is meant as a drag.
  await touchDrag(page, held, { x: held.x + 3, y: held.y + 2 }, 3);
  await expect(page.locator('[data-testid="text-input"]')).toHaveValue("Paid in full");
  await page.keyboard.press("Escape");
  await page.locator('[data-testid="text-selection"]').waitFor();
  expect((await page.locator('[data-testid="text-selection"]').boundingBox())!.x).toBeCloseTo(before.x, 1);
});

test("a pinch with a finger resting on a held writing zooms without carrying it", async ({ page }) => {
  const held = await writeAndHold(page);
  const before = await pdfPointAt(page, held);
  const input = await page.context().newCDPSession(page);
  const resting = { id: 0, x: held.x, y: held.y };
  await input.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [resting] });
  // A second finger elsewhere on the page: from here on it is a pinch, not a drag.
  for (let step = 1; step <= 8; step += 1) {
    await input.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [resting, { id: 1, x: held.x + 40 + step * 8, y: held.y + 40 + step * 8 }],
    });
  }
  await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await input.detach();
  await page.waitForTimeout(300);
  const after = await pdfPointAt(page, centerOf((await page.locator('[data-testid="text-selection"]').boundingBox())!));
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
});

test("the toolbar sits clear of the last page", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await page.mouse.wheel(0, 20_000);
  const toolbar = (await page.locator('[data-action="save"]').boundingBox())!;
  const sheet = (await pageCanvas(page).boundingBox())!;
  expect(toolbar.y).toBeGreaterThan(sheet.y + sheet.height);
  expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(page.viewportSize()!.height);
});

test("two fingers pinch the page bigger, and pinch it back", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  const fitted = await widthOnScreen(pageCanvas(page));
  const middle = { x: 195, y: 300 };

  await pinch(page, middle, 100, 300);
  expect(await widthOnScreen(pageCanvas(page))).toBeGreaterThan(fitted * 2);

  await pinch(page, middle, 300, 100);
  expect(await widthOnScreen(pageCanvas(page))).toBeCloseTo(fitted, 0);
});

test("a pinch is the browser's to ignore and the page's to answer", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await pinch(page, { x: 195, y: 300 }, 100, 300);
  expect(await browserZoom(page)).toBe(1);
});

test("the toolbar is still at the bottom of the screen after pinching in", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await pinch(page, { x: 195, y: 300 }, 80, 320);
  const window = page.viewportSize()!;
  const toolbar = (await page.locator('[data-action="save"]').boundingBox())!;
  expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(window.height);
  expect(toolbar.y).toBeGreaterThan(window.height / 2);
});

test("a pinch with the pen out zooms and leaves no ink behind", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await page.locator('[data-tool="draw"]').tap();
  const fitted = await widthOnScreen(pageCanvas(page));
  const middle = await viewportPoint(page, { x: 300, y: 420 });

  await pinch(page, middle, 100, 260);

  expect(await widthOnScreen(pageCanvas(page))).toBeGreaterThan(fitted * 1.5);
  expect(await darkPixels(page, BLANK)).toBe(0);
  await expect(page.locator('[data-action="undo"]')).toBeDisabled();
});

test("a pinch zooms about the fingers, not the corner of the screen", async ({ page }) => {
  await openPdf(page, await buildPlainPdf(3));
  const fingers = { x: 195, y: 380 };
  const under = await pdfPointAt(page, fingers);

  await pinch(page, fingers, 80, 320);

  // Touches come faster than a document of pages can be rendered again, and every one has to count.
  const landed = await viewportPoint(page, under);
  expect(Math.abs(landed.x - fingers.x)).toBeLessThan(12);
  expect(Math.abs(landed.y - fingers.y)).toBeLessThan(12);
});

test("nothing is read again while the fingers are still on the page", async ({ page }) => {
  await openPdf(page, await buildPlainPdf(3));
  await countPaintings(page);
  let whileHeld = -1;

  // A hand resting halfway through a pinch has not finished pinching, and reading a page again
  // is the better part of a second: doing it under the fingers is what makes a pinch stutter.
  await pinchAndHold(page, { x: 195, y: 380 }, async () => {
    whileHeld = await countPaintings(page);
  });

  expect(whileHeld).toBe(0);
  // Once they lift, the pages are read again at the size they have arrived at.
  await expect.poll(() => countPaintings(page)).toBeGreaterThan(0);
  await expect.poll(() => sharpness(pageCanvas(page))).toBeGreaterThanOrEqual(1);
});

test("a pinched page is painted for the screen's own pixels, not just its points", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await pinch(page, { x: 195, y: 300 }, 60, 340);
  await pinch(page, { x: 195, y: 300 }, 60, 340);
  await sharpPart(page).waitFor();
  const perPoint = await page.evaluate(() => Math.min(window.devicePixelRatio, 2));
  await expect.poll(() => sharpness(sharpPart(page))).toBeGreaterThanOrEqual(perPoint - 0.01);
});
