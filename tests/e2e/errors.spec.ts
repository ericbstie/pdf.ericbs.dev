import { expect, test } from "@playwright/test";
import { buildPlainPdf } from "../fixtures";
import { openPdf, pageCanvas } from "./harness";

const notice = (page: import("@playwright/test").Page) => page.locator('[data-testid="notice"]');

async function choose(page: import("@playwright/test").Page, name: string, bytes: Buffer): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "application/pdf", buffer: bytes });
}

test("a file that is not a PDF says so rather than doing nothing", async ({ page }) => {
  await page.goto("/");
  await choose(page, "holiday.pdf", Buffer.from("this is not a pdf at all"));
  await expect(notice(page)).toBeVisible();
  await expect(notice(page)).toContainText("could not be read as a PDF");
  await expect(pageCanvas(page)).toHaveCount(0);
});

test("a truncated PDF is refused rather than half drawn", async ({ page }) => {
  await page.goto("/");
  const whole = Buffer.from(await buildPlainPdf());
  await choose(page, "cut-short.pdf", whole.subarray(0, Math.floor(whole.length / 3)));
  await expect(notice(page)).toBeVisible();
  await expect(pageCanvas(page)).toHaveCount(0);
});

test("the notice can be dismissed", async ({ page }) => {
  await page.goto("/");
  await choose(page, "holiday.pdf", Buffer.from("nope"));
  await expect(notice(page)).toBeVisible();
  await page.getByLabel("Dismiss").click();
  await expect(notice(page)).toHaveCount(0);
});

test("a good PDF still opens after a bad one, and clears the complaint", async ({ page }) => {
  await page.goto("/");
  await choose(page, "holiday.pdf", Buffer.from("nope"));
  await expect(notice(page)).toBeVisible();
  await choose(page, "lease.pdf", Buffer.from(await buildPlainPdf()));
  await expect(pageCanvas(page)).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
});

test("the same file can be chosen again after being dismissed", async ({ page }) => {
  await openPdf(page, await buildPlainPdf());
  await page.locator('[data-action="open"]').click();
  await choose(page, "lease.pdf", Buffer.from(await buildPlainPdf(2)));
  await expect(page.locator("canvas[data-page]")).toHaveCount(2);
});
