import type { Download, Locator, Page } from "@playwright/test";
import { PAGE_SIZE, type Rect } from "../fixtures";

export type Point = { x: number; y: number };

export function pageCanvas(page: Page, pageNumber = 1): Locator {
  return page.locator(`canvas[data-page="${pageNumber}"]`);
}

/** Every page the document lays out, painted or not — `pageCanvas` only sees the painted ones. */
export function sheets(page: Page): Locator {
  return page.locator("[data-sheet]");
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
  const point = pdfToViewport(box, pdfPoint);
  const window = page.viewportSize();
  if (window && (point.x < 0 || point.y < 0 || point.x > window.width || point.y > window.height)) {
    throw new Error(`(${pdfPoint.x}, ${pdfPoint.y}) is scrolled out of the window`);
  }
  return point;
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

/**
 * Long enough for the gesture recogniser to finish with one touch before the next arrives.
 * Injected events carry no pause of their own, and a tap in the same tick as the previous
 * touchend has its click swallowed. No finger lifts and lands that fast.
 */
const SETTLE = 150;

/** A real finger drag. Playwright's touchscreen only taps, so the raw input events go through CDP. */
export async function touchDrag(page: Page, from: Point, to: Point, steps = 10): Promise<void> {
  const input = await page.context().newCDPSession(page);
  const step = (index: number): Point => ({
    x: from.x + ((to.x - from.x) * index) / steps,
    y: from.y + ((to.y - from.y) * index) / steps,
  });
  await input.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [step(0)] });
  for (let index = 1; index <= steps; index += 1) {
    await input.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [step(index)] });
  }
  await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await input.detach();
  await page.waitForTimeout(SETTLE);
}

/** Drops a file onto the editor, the way a person would. Dispatched in one go, so it can land mid-restore. */
export async function dropFile(page: Page, name: string, bytes: Uint8Array): Promise<void> {
  await page.evaluate(
    ([label, contents]) => {
      const file = new File([new Uint8Array(contents as number[])], label as string, { type: "application/pdf" });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document
        .querySelector(".overflow-auto")!
        .dispatchEvent(new DragEvent("drop", { dataTransfer, bubbles: true, cancelable: true }));
    },
    [name, [...bytes]] as const,
  );
}
