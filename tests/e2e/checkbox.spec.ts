import { expect, test } from "@playwright/test";
import { FLAT_BOXES, FORM_BOXES, buildFlatCheckboxPdf, buildFormCheckboxPdf } from "../fixtures";
import { readCheckboxStates } from "../verify";
import { centerOf, darkPixels, openPdf, savePdf, viewportPoint } from "./harness";

async function clickBox(page: import("@playwright/test").Page, box: { x: number; y: number; width: number; height: number }) {
  const point = await viewportPoint(page, centerOf(box));
  await page.mouse.click(point.x, point.y);
}

test("ticks a printed checkbox on a plain click", async ({ page }) => {
  await openPdf(page, await buildFlatCheckboxPdf());
  const box = FLAT_BOXES[0]!;
  const before = await darkPixels(page, box);
  await clickBox(page, box);
  await expect.poll(() => darkPixels(page, box)).toBeGreaterThan(before + 20);
});

test("unticks on the next click", async ({ page }) => {
  await openPdf(page, await buildFlatCheckboxPdf());
  const box = FLAT_BOXES[1]!;
  const before = await darkPixels(page, box);
  await clickBox(page, box);
  await expect.poll(() => darkPixels(page, box)).toBeGreaterThan(before + 20);
  await clickBox(page, box);
  await expect.poll(() => darkPixels(page, box)).toBe(before);
});

test("leaves neighbouring checkboxes untouched", async ({ page }) => {
  await openPdf(page, await buildFlatCheckboxPdf());
  const [first, second] = [FLAT_BOXES[0]!, FLAT_BOXES[1]!];
  const untouched = await darkPixels(page, second);
  await clickBox(page, first);
  await expect.poll(() => darkPixels(page, first)).toBeGreaterThan(untouched + 20);
  expect(await darkPixels(page, second)).toBe(untouched);
});

test("ticks a form checkbox on a plain click", async ({ page }) => {
  await openPdf(page, await buildFormCheckboxPdf());
  const box = FORM_BOXES[0]!;
  const before = await darkPixels(page, box);
  await clickBox(page, box);
  await expect.poll(() => darkPixels(page, box)).toBeGreaterThan(before + 20);
});

test("takes back a tick the file arrived with", async ({ page }) => {
  await openPdf(page, await buildFormCheckboxPdf(["agree"]));
  const [ticked, empty] = [FORM_BOXES[0]!, FORM_BOXES[1]!];
  const cleared = await darkPixels(page, empty);
  expect(await darkPixels(page, ticked)).toBeGreaterThan(cleared + 20);
  await clickBox(page, ticked);
  // What is left is the box's own outline, as bare as the one beneath it that was never ticked.
  await expect.poll(() => darkPixels(page, ticked)).toBeLessThan(cleared + 3);
});

test("saves a checkbox the file arrived ticked as cleared", async ({ page }) => {
  await openPdf(page, await buildFormCheckboxPdf(["agree"]));
  const before = await darkPixels(page, FORM_BOXES[0]!);
  await clickBox(page, FORM_BOXES[0]!);
  await expect.poll(() => darkPixels(page, FORM_BOXES[0]!)).toBeLessThan(before - 20);
  expect(await readCheckboxStates(await savePdf(page))).toEqual(new Map([["agree", false], ["subscribe", false]]));
});
