import { type Locator, type Page, expect, test } from "@playwright/test";
import { buildPlainPdf, buildRotatedPdf } from "../fixtures";
import { openPdf, pageCanvas, viewportPoint, wheelZoom, widthOnScreen } from "./harness";

/** The words the plain fixture is printed with, as a line of the page's own text. */
const LINE = "Rental agreement";

function words(page: Page, pageNumber = 1): Locator {
  return page.locator(`[data-text="${pageNumber}"] span`).first();
}

/** Sweeps the pointer along a line of the page's printed words, the way a hand selecting them does. */
async function dragAcross(page: Page, line: Locator): Promise<void> {
  const box = (await line.boundingBox())!;
  const middle = box.y + box.height / 2;
  await page.mouse.move(box.x + 1, middle);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, middle, { steps: 10 });
  await page.mouse.up();
}

function selectedText(page: Page): Promise<string> {
  return page.evaluate(() => window.getSelection()?.toString() ?? "");
}

test("a drag across the printed words selects them", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await expect(words(page)).toHaveText(LINE);
  await dragAcross(page, words(page));
  expect(await selectedText(page)).toContain("Rental");
});

test("the words are invisible: the painting of the page is what is seen", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await expect(words(page)).toHaveCSS("color", "rgba(0, 0, 0, 0)");
});

test("the pen draws rather than selecting", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await expect(words(page)).toHaveText(LINE);
  await page.locator('[data-tool="draw"]').click();
  await dragAcross(page, words(page));
  expect(await selectedText(page)).toBe("");
});

test("the words keep their place on the page when it is zoomed", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await expect(words(page)).toHaveText(LINE);
  const sheet = await widthOnScreen(pageCanvas(page));
  const line = (await words(page).boundingBox())!;
  await wheelZoom(page, await viewportPoint(page, { x: 72, y: 740 }), 5);
  const zoomed = (await words(page).boundingBox())!;
  const grew = (await widthOnScreen(pageCanvas(page))) / sheet;
  expect(grew).toBeGreaterThan(1.1);
  expect(zoomed.width / line.width).toBeCloseTo(grew, 1);
});

test("the caret still opens on the paper under the words", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await expect(words(page)).toHaveText(LINE);
  await page.locator('[data-tool="text"]').click();
  const box = (await words(page).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('[data-testid="text-input"]')).toBeVisible();
});

test("a writing over the printed words is taken hold of rather than selected", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await expect(words(page)).toHaveText(LINE);
  const box = (await words(page).boundingBox())!;
  const over = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.locator('[data-tool="text"]').click();
  await page.mouse.click(over.x, over.y);
  await page.keyboard.type("Paid");
  await page.keyboard.press("Enter");
  await page.locator('[data-tool="text"]').click();
  await page.mouse.click(over.x, over.y);
  await expect(page.locator('[data-testid="text-selection"]')).toBeVisible();
  expect(await selectedText(page)).toBe("");
});

/**
 * How much of the painted page is ink, in the patch of screen the transparent words claim. The
 * words are only any use where the letters are: this asks whether the two are in the same place.
 */
async function inkUnder(page: Page, rect: { x: number; y: number; width: number; height: number }): Promise<number> {
  return pageCanvas(page).evaluate((element, box) => {
    const canvas = element as HTMLCanvasElement;
    const sheet = canvas.getBoundingClientRect();
    const perPixel = canvas.width / sheet.width;
    const region = {
      x: Math.round((box.x - sheet.left) * perPixel),
      y: Math.round((box.y - sheet.top) * perPixel),
      width: Math.max(1, Math.round(box.width * perPixel)),
      height: Math.max(1, Math.round(box.height * perPixel)),
    };
    const { data } = canvas.getContext("2d")!.getImageData(region.x, region.y, region.width, region.height);
    let dark = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (0.299 * data[index]! + 0.587 * data[index + 1]! + 0.114 * data[index + 2]! < 128) dark += 1;
    }
    return dark;
  }, rect);
}

for (const turn of [0, 90, 180, 270]) {
  test(`the words lie on the letters of a page turned ${turn} degrees`, async ({ page }) => {
    await openPdf(page, await buildRotatedPdf(turn));
    await expect(words(page)).toHaveText(LINE);
    const box = (await words(page).boundingBox())!;
    const sheet = (await pageCanvas(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(sheet.x - 1);
    expect(box.y).toBeGreaterThanOrEqual(sheet.y - 1);
    expect(await inkUnder(page, box)).toBeGreaterThan(50);
  });
}
