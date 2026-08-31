import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import * as workerHandler from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { findCheckboxes, toBitmap, toPagePoints } from "./detect";
import type { Box, Rect } from "./edits";
import { overlaps } from "./viewport";

/** pdf.js picks this up and parses on this thread, sparing us a separately hosted worker file. */
(globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = workerHandler;

/** The range a printed checkbox falls in, in points. */
const BOX_POINTS = { smallest: 7, largest: 26 };

export type PageSize = { width: number; height: number };

export type RenderedPage = {
  number: number;
  size: PageSize;
  image: HTMLCanvasElement;
  pixelsPerPoint: number;
  boxes: Box[];
};

export type OpenPdf = {
  sizes: readonly PageSize[];
  render(pageNumber: number, pixelsPerPoint: number): Promise<RenderedPage>;
};

function toPageSpace(pdfRect: number[], pageHeight: number): Rect {
  const [left, bottom, right, top] = pdfRect as [number, number, number, number];
  return { x: left, y: pageHeight - top, width: right - left, height: top - bottom };
}

async function widgetBoxes(page: PDFPageProxy, pageHeight: number): Promise<Box[]> {
  const annotations = await page.getAnnotations();
  return annotations
    .filter(annotation => annotation.subtype === "Widget" && annotation.checkBox === true)
    .map(annotation => ({
      page: page.pageNumber,
      id: `field:${annotation.fieldName}`,
      field: annotation.fieldName as string,
      rect: toPageSpace(annotation.rect, pageHeight),
    }));
}

function printedBoxes(image: HTMLCanvasElement, page: RenderTarget): Box[] {
  const pixels = image.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, image.width, image.height);
  const size = { minPixels: BOX_POINTS.smallest * page.pixelsPerPoint, maxPixels: BOX_POINTS.largest * page.pixelsPerPoint };
  return findCheckboxes(toBitmap(pixels), size)
    .map(found => toPagePoints(found, page.pixelsPerPoint))
    .map(rect => ({ page: page.number, id: `drawn:${page.number}:${Math.round(rect.x)},${Math.round(rect.y)}`, rect }));
}

type RenderTarget = { number: number; pixelsPerPoint: number };

async function paintToCanvas(page: PDFPageProxy, pixelsPerPoint: number): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale: pixelsPerPoint });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas;
}

/** Widgets win: a form checkbox and the square printed under it are the same box. */
function mergeBoxes(widgets: readonly Box[], printed: readonly Box[]): Box[] {
  return [...widgets, ...printed.filter(box => !widgets.some(widget => overlaps(widget.rect, box.rect)))];
}

export async function openPdf(bytes: Uint8Array): Promise<OpenPdf> {
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const pages = await Promise.all(
    Array.from({ length: doc.numPages }, (_, index) => doc.getPage(index + 1)),
  );
  const sizes = pages.map(page => {
    const [width, height] = [page.view[2]! - page.view[0]!, page.view[3]! - page.view[1]!];
    return { width, height };
  });
  return {
    sizes,
    async render(pageNumber, pixelsPerPoint) {
      const page = pages[pageNumber - 1]!;
      const size = sizes[pageNumber - 1]!;
      const image = await paintToCanvas(page, pixelsPerPoint);
      const target = { number: pageNumber, pixelsPerPoint };
      return {
        number: pageNumber,
        size,
        image,
        pixelsPerPoint,
        boxes: mergeBoxes(await widgetBoxes(page, size.height), printedBoxes(image, target)),
      };
    },
  };
}
