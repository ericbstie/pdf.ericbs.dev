import { type Page, expect, test } from "@playwright/test";
import { FLAT_BOXES, FORM_BOXES, buildFlatCheckboxPdf, buildFormCheckboxPdf } from "../fixtures";
import { readCheckboxStates, readTextPlacements } from "../verify";
import { centerOf, darkPixels, openPdf, savePdf, viewportPoint } from "./harness";

const INK = { x: 200, y: 400, width: 200, height: 40 };
const WRITING = { x: 200, y: 500 };
const WORDS = "Paid in full";

async function drawAcross(page: Page): Promise<void> {
  await page.locator('[data-tool="draw"]').click();
  const from = await viewportPoint(page, { x: 210, y: 420 });
  const to = await viewportPoint(page, { x: 380, y: 420 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

async function write(page: Page): Promise<void> {
  await page.locator('[data-tool="text"]').click();
  const point = await viewportPoint(page, WRITING);
  await page.mouse.click(point.x, point.y);
  await page.locator('[data-testid="text-input"]').waitFor();
  await page.keyboard.type(WORDS);
  await page.keyboard.press("Enter");
}

async function tick(page: Page, box: (typeof FLAT_BOXES)[number]): Promise<void> {
  const point = await viewportPoint(page, centerOf(box));
  await page.mouse.click(point.x, point.y);
}

test("keeps every edit in the saved file", async ({ page }) => {
  await openPdf(page, await buildFlatCheckboxPdf());
  const untickedBox = await darkPixels(page, FLAT_BOXES[0]!);
  await tick(page, FLAT_BOXES[0]!);
  await drawAcross(page);
  await write(page);
  const saved = await savePdf(page);

  const texts = await readTextPlacements(saved);
  expect(texts.map(item => item.text)).toContain("Rental agreement");
  const written = texts.find(item => item.text === WORDS);
  expect(written).toBeDefined();
  expect(Math.abs(written!.x - WRITING.x)).toBeLessThan(4);
  expect(Math.abs(written!.y - WRITING.y)).toBeLessThan(8);

  await openPdf(page, saved, "saved.pdf");
  expect(await darkPixels(page, INK)).toBeGreaterThan(50);
  expect(await darkPixels(page, FLAT_BOXES[0]!)).toBeGreaterThan(untickedBox + 20);
});

test("saves a ticked form checkbox as a field value", async ({ page }) => {
  await openPdf(page, await buildFormCheckboxPdf());
  const unticked = await darkPixels(page, FORM_BOXES[0]!);
  await tick(page, FORM_BOXES[0]!);
  const saved = await savePdf(page);

  expect(await readCheckboxStates(saved)).toEqual(
    new Map([
      [FORM_BOXES[0]!.name, true],
      [FORM_BOXES[1]!.name, false],
    ]),
  );

  await openPdf(page, saved, "saved.pdf");
  expect(await darkPixels(page, FORM_BOXES[0]!)).toBeGreaterThan(unticked + 20);
  expect(await darkPixels(page, FORM_BOXES[1]!)).toBe(unticked);
});
