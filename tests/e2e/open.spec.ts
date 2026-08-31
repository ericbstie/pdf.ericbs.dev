import { expect, test } from "@playwright/test";
import { buildFlatCheckboxPdf, buildPlainPdf } from "../fixtures";
import { darkPixels, openPdf, pageCanvas } from "./harness";

test("paints the chosen file", async ({ page }) => {
  await openPdf(page, await buildFlatCheckboxPdf());
  expect(await darkPixels(page, { x: 60, y: 610, width: 220, height: 150 })).toBeGreaterThan(100);
});

test("paints every page of the chosen file", async ({ page }) => {
  await openPdf(page, await buildPlainPdf(3));
  await expect(pageCanvas(page, 3)).toBeVisible();
  await expect(page.locator("canvas[data-page]")).toHaveCount(3);
});
