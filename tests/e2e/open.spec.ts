import { expect, test } from "@playwright/test";
import { buildFlatCheckboxPdf, buildPlainPdf } from "../fixtures";
import { darkPixels, openPdf, pageCanvas } from "./harness";

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
