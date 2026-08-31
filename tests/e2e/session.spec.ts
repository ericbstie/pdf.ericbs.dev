import { type Page, expect, test } from "@playwright/test";
import { FLAT_BOXES, buildFlatCheckboxPdf, buildPlainPdf } from "../fixtures";
import { centerOf, darkPixels, openPdf, pageCanvas, savePdf, viewportPoint } from "./harness";

/** Two clear bands of the page, far enough apart that a stroke in one cannot show up in the other. */
const BLANK = { x: 200, y: 400, width: 200, height: 40 };
const ELSEWHERE = { x: 200, y: 500, width: 200, height: 40 };

async function drawAcross(page: Page, band = BLANK): Promise<void> {
  const pen = page.locator('[data-tool="draw"]');
  if ((await pen.getAttribute("aria-pressed")) !== "true") await pen.click();
  const from = await viewportPoint(page, { x: 210, y: band.y + 20 });
  const to = await viewportPoint(page, { x: 380, y: band.y + 20 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => darkPixels(page, band)).toBeGreaterThan(50);
}

/** Whether the browser put up its "leave site?" dialog on the way out. */
async function asksBeforeLeaving(page: Page): Promise<boolean> {
  const raised = page.waitForEvent("dialog", { timeout: 2500 }).catch(() => null);
  await page.close({ runBeforeUnload: true });
  const dialog = await raised;
  if (dialog) await dialog.dismiss();
  return dialog !== null;
}

test("a reload brings back the file and the edits made to it", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await drawAcross(page);

  await page.reload();

  await expect(pageCanvas(page)).toBeVisible();
  await expect.poll(() => darkPixels(page, BLANK)).toBeGreaterThan(50);
});

test("a ticked checkbox is still ticked after a reload", async ({ page }) => {
  await openPdf(page, await buildFlatCheckboxPdf());
  const box = FLAT_BOXES[0]!;
  const unticked = await darkPixels(page, box);
  const point = await viewportPoint(page, centerOf(box));
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => darkPixels(page, box)).toBeGreaterThan(unticked + 20);

  await page.reload();

  await expect(pageCanvas(page)).toBeVisible();
  await expect.poll(() => darkPixels(page, box)).toBeGreaterThan(unticked + 20);
});

test("an edit taken back is not brought forward", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await drawAcross(page);
  await page.locator('[data-action="undo"]').click();
  await expect.poll(() => darkPixels(page, BLANK)).toBe(0);

  await page.reload();

  await expect(pageCanvas(page)).toBeVisible();
  expect(await darkPixels(page, BLANK)).toBe(0);
});

test("the edits kept are the ones for the file now open", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await drawAcross(page);
  await openPdf(page, await buildPlainPdf(2), "second.pdf");

  await page.reload();

  await expect(page.locator("canvas[data-page]")).toHaveCount(2);
  expect(await darkPixels(page, BLANK)).toBe(0);
});

test("a saved file still opens straight into the editor when nothing was edited", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await page.reload();
  await expect(pageCanvas(page)).toBeVisible();
});

test("leaving is confirmed while edits are unsaved", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await drawAcross(page);
  expect(await asksBeforeLeaving(page)).toBe(true);
});

test("leaving is not confirmed when nothing has been edited", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  expect(await asksBeforeLeaving(page)).toBe(false);
});

test("leaving is not confirmed once the edits have been downloaded", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await drawAcross(page);
  await savePdf(page);
  expect(await asksBeforeLeaving(page)).toBe(false);
});

test("leaving is confirmed again once editing carries on past a download", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await drawAcross(page);
  await savePdf(page);
  await drawAcross(page, ELSEWHERE);
  expect(await asksBeforeLeaving(page)).toBe(true);
});

test("taking every edit back leaves nothing to confirm", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await drawAcross(page);
  await page.locator('[data-action="undo"]').click();
  await expect.poll(() => darkPixels(page, BLANK)).toBe(0);
  expect(await asksBeforeLeaving(page)).toBe(false);
});
