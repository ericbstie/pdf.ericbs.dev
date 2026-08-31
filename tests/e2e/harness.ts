import type { Download, Locator, Page } from "@playwright/test";
import { PAGE_SIZE, type Rect } from "../fixtures";

export type Point = { x: number; y: number };

export function pageCanvas(page: Page, pageNumber = 1): Locator {
  return page.locator(`canvas[data-page="${pageNumber}"]`);
}

export async function openPdf(page: Page, bytes: Uint8Array, name = "fixture.pdf"): Promise<void> {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "application/pdf", buffer: Buffer.from(bytes) });
  await pageCanvas(page).waitFor();
}

/** PDF user space (y up from the page bottom) to viewport pixels inside a canvas box. */
export function pdfToViewport(canvasBox: Rect, point: Point): Point {
  const scale = canvasBox.width / PAGE_SIZE.width;
  return {
    x: canvasBox.x + point.x * scale,
    y: canvasBox.y + (PAGE_SIZE.height - point.y) * scale,
  };
}

export function centerOf(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export async function viewportPoint(page: Page, pdfPoint: Point, pageNumber = 1): Promise<Point> {
  const box = await pageCanvas(page, pageNumber).boundingBox();
  if (!box) throw new Error(`page ${pageNumber} is not laid out`);
  return pdfToViewport(box, pdfPoint);
}

/** Counts painted pixels inside a PDF-space rect, read straight off the rendered canvas. */
export async function darkPixels(page: Page, rectPdf: Rect, pageNumber = 1): Promise<number> {
  return pageCanvas(page, pageNumber).evaluate((canvas, [rect, size]) => {
    const element = canvas as HTMLCanvasElement;
    const scale = element.width / size.width;
    const region = {
      x: Math.round(rect.x * scale),
      y: Math.round((size.height - rect.y - rect.height) * scale),
      width: Math.max(1, Math.round(rect.width * scale)),
      height: Math.max(1, Math.round(rect.height * scale)),
    };
    const { data } = element.getContext("2d")!.getImageData(region.x, region.y, region.width, region.height);
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! < 128) continue;
      const luminance = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
      if (luminance < 128) dark += 1;
    }
    return dark;
  }, [rectPdf, PAGE_SIZE] as const);
}

export async function savePdf(page: Page): Promise<Uint8Array> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator('[data-action="save"]').click(),
  ]);
  return readDownload(download);
}

async function readDownload(download: Download): Promise<Uint8Array> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return new Uint8Array(Buffer.concat(chunks));
}
