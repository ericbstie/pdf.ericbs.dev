import { type Page, expect, test } from "@playwright/test";
import { FLAT_BOXES, buildFlatCheckboxPdf, buildPlainPdf } from "../fixtures";
import { readTextPlacements } from "../verify";
import { centerOf, darkPixels, openPdf, savePdf, viewportPoint } from "./harness";

/** Where the words are written, in PDF space, and the patch of paper they land on. */
const AT = { x: 200, y: 400 };
const BLANK = { x: 190, y: 380, width: 220, height: 40 };
/** The same patch, a hundred points to the left and forty down, where a drag will take them. */
const MOVED = { x: 90, y: 340, width: 220, height: 40 };

async function writeAt(page: Page, words: string): Promise<void> {
  await page.locator('[data-tool="text"]').click();
  const point = await viewportPoint(page, AT);
  await page.mouse.click(point.x, point.y);
  await page.locator('[data-testid="text-input"]').waitFor();
  await page.keyboard.type(words);
  await page.keyboard.press("Enter");
}

/** Writes something, puts the tools away, and takes hold of it again. */
async function writeAndSelect(page: Page, words = "Paid in full"): Promise<void> {
  await openPdf(page, await buildPlainPdf());
  await writeAt(page, words);
  await page.locator('[data-tool="text"]').click();
  const point = await viewportPoint(page, AT);
  await page.mouse.click(point.x, point.y);
  await page.locator('[data-testid="mark-selection"]').waitFor();
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

test("clicking a writing takes hold of it", async ({ page }) => {
  await writeAndSelect(page);
  await expect(page.locator('[data-testid="remove-mark"]')).toBeVisible();
});

test("clicking the paper beside it lets go", async ({ page }) => {
  await writeAndSelect(page);
  const away = await viewportPoint(page, { x: 400, y: 600 });
  await page.mouse.click(away.x, away.y);
  await expect(page.locator('[data-testid="mark-selection"]')).toHaveCount(0);
});

test("the X takes the writing off the page", async ({ page }) => {
  await writeAndSelect(page);
  await page.locator('[data-testid="remove-mark"]').click();
  await expect(page.locator('[data-testid="mark-selection"]')).toHaveCount(0);
  await expect.poll(() => darkPixels(page, BLANK)).toBe(0);
});

test("Delete takes the writing off the page", async ({ page }) => {
  await writeAndSelect(page);
  await page.keyboard.press("Delete");
  await expect(page.locator('[data-testid="mark-selection"]')).toHaveCount(0);
  await expect.poll(() => darkPixels(page, BLANK)).toBe(0);
});

test("Escape lets go of the writing without taking it away", async ({ page }) => {
  await writeAndSelect(page);
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-testid="mark-selection"]')).toHaveCount(0);
  expect(await darkPixels(page, BLANK)).toBeGreaterThan(50);
});

test("dragging a writing carries it, on the page and into the saved file", async ({ page }) => {
  await writeAndSelect(page);
  const from = await viewportPoint(page, AT);
  const to = await viewportPoint(page, { x: 100, y: 360 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => darkPixels(page, BLANK)).toBe(0);
  await expect.poll(() => darkPixels(page, MOVED)).toBeGreaterThan(50);
  const written = (await readTextPlacements(await savePdf(page))).find(item => item.text === "Paid in full");
  expect(written!.x).toBeCloseTo(100, 0);
});

test("a writing is carried by the press that takes hold of it, in one motion", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await writeAt(page, "Paid in full");
  await page.locator('[data-tool="text"]').click();
  const from = await viewportPoint(page, AT);
  const to = await viewportPoint(page, { x: 100, y: 360 });
  // Nothing is in hand yet: press, drag and let go is how a mouse carries anything, and the press
  // that finds the writing is the one that has to pick it up.
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => darkPixels(page, BLANK)).toBe(0);
  await expect.poll(() => darkPixels(page, MOVED)).toBeGreaterThan(50);
  const written = (await readTextPlacements(await savePdf(page))).find(item => item.text === "Paid in full");
  expect(written!.x).toBeCloseTo(100, 0);
});

test("a writing carried in one motion is put back by a single undo", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await writeAt(page, "Paid in full");
  await page.locator('[data-tool="text"]').click();
  const from = await viewportPoint(page, AT);
  const to = await viewportPoint(page, { x: 100, y: 360 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => darkPixels(page, MOVED)).toBeGreaterThan(50);
  await page.locator('[data-action="undo"]').click();
  await expect.poll(() => darkPixels(page, BLANK)).toBeGreaterThan(50);
  await expect.poll(() => darkPixels(page, MOVED)).toBe(0);
});

test("clicking a writing that is already held opens it to be typed into", async ({ page }) => {
  await writeAndSelect(page, "Paid");
  const point = await viewportPoint(page, AT);
  await page.mouse.click(point.x, point.y);
  const field = page.locator('[data-testid="text-input"]');
  await expect(field).toHaveValue("Paid");
  await page.keyboard.press("End");
  await page.keyboard.type(" in full");
  await page.keyboard.press("Enter");
  const written = (await readTextPlacements(await savePdf(page))).map(item => item.text);
  expect(written).toContain("Paid in full");
  expect(written).not.toContain("Paid");
});

test("a writing rubbed out to nothing but spaces goes away", async ({ page }) => {
  await writeAndSelect(page);
  const point = await viewportPoint(page, AT);
  await page.mouse.click(point.x, point.y);
  await page.locator('[data-testid="text-input"]').fill("   ");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-testid="mark-selection"]')).toHaveCount(0);
  await expect.poll(() => darkPixels(page, BLANK)).toBe(0);
});

test("undo puts a carried writing back where it was", async ({ page }) => {
  await writeAndSelect(page);
  const from = await viewportPoint(page, AT);
  const to = await viewportPoint(page, { x: 100, y: 360 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => darkPixels(page, MOVED)).toBeGreaterThan(50);
  await page.locator('[data-action="undo"]').click();
  await expect.poll(() => darkPixels(page, BLANK)).toBeGreaterThan(50);
  await expect.poll(() => darkPixels(page, MOVED)).toBe(0);
});

test("a writing dragged off the edge is kept on the page", async ({ page }) => {
  await writeAndSelect(page);
  const from = await viewportPoint(page, AT);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Well past the left edge of the sheet, which pointer capture lets the drag follow.
  await page.mouse.move(4, from.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => darkPixels(page, { x: 0, y: 390, width: 130, height: 20 })).toBeGreaterThan(50);
  const written = (await readTextPlacements(await savePdf(page))).find(item => item.text === "Paid in full");
  expect(written).toBeDefined();
  expect(written!.x).toBeCloseTo(0, 0);
});

test("a checkbox ticked while the caret is open is the thing the next undo takes back", async ({ page }) => {
  await openPdf(page, await buildFlatCheckboxPdf());
  await writeAt(page, "Paid");
  await page.locator('[data-tool="text"]').click();
  const spot = await viewportPoint(page, AT);
  await page.mouse.click(spot.x, spot.y);
  await page.locator('[data-testid="mark-selection"]').waitFor();
  await page.mouse.click(spot.x, spot.y);
  await expect(page.locator('[data-testid="text-input"]')).toHaveValue("Paid");
  await page.keyboard.press("End");
  await page.keyboard.type(" in full");

  // Clicking the box is what closes the caret, so the two commands are made in the one gesture.
  const box = FLAT_BOXES[0]!;
  const bare = await darkPixels(page, box);
  const tick = await viewportPoint(page, centerOf(box));
  await page.mouse.click(tick.x, tick.y);
  await expect.poll(() => darkPixels(page, box)).toBeGreaterThan(bare + 20);

  await page.locator('[data-action="undo"]').click();
  await expect.poll(() => darkPixels(page, box)).toBeLessThan(bare + 20);
  const written = (await readTextPlacements(await savePdf(page))).map(item => item.text);
  expect(written).toContain("Paid in full");
});
