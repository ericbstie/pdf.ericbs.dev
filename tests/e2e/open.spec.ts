import { expect, test } from "@playwright/test";
import { buildFlatCheckboxPdf, buildPlainPdf } from "../fixtures";
import { darkPixels, openPdf, pageCanvas, viewportPoint } from "./harness";

/** Where `buildPlainPdf` prints each later page's heading. */
const HEADING = { x: 68, y: 736, width: 130, height: 24 };

test("paints the chosen file", async ({ page }) => {
  await openPdf(page, await buildFlatCheckboxPdf());
  expect(await darkPixels(page, { x: 60, y: 610, width: 220, height: 150 })).toBeGreaterThan(100);
});

test("paints a page once it is scrolled to, and not before", async ({ page }) => {
  await openPdf(page, await buildPlainPdf(3));
  await expect(pageCanvas(page, 3)).toHaveCount(0);
  await page.mouse.wheel(0, 20_000);
  await expect(pageCanvas(page, 3)).toBeVisible();
  await expect(page.locator("canvas[data-page]")).toHaveCount(3);
  expect(await darkPixels(page, HEADING, 3)).toBeGreaterThan(50);
});

test("opening another file leaves nothing of the last one behind", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await page.locator('[data-tool="text"]').click();
  const caret = await viewportPoint(page, { x: 200, y: 400 });
  await page.mouse.click(caret.x, caret.y);
  await page.locator('[data-testid="text-input"]').waitFor();
  await page.keyboard.type("half typed");

  await page.locator('input[type="file"]').setInputFiles({
    name: "next.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await buildPlainPdf(2)),
  });

  await expect(page.locator("canvas[data-page]")).toHaveCount(2);
  await expect(page.locator('[data-testid="text-input"]')).toHaveCount(0);
  expect(await darkPixels(page, { x: 190, y: 380, width: 220, height: 40 })).toBe(0);
});
