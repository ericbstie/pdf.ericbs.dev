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

type PageViewport = ReturnType<PDFPageProxy["getViewport"]>;

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

/** Annotations sit in PDF user space, so the viewport places them the same way it places the page. */
function toViewSpace(pdfRect: number[], viewport: PageViewport): Rect {
  const [left, bottom, right, top] = pdfRect as [number, number, number, number];
  const [x1, y1] = viewport.convertToViewportPoint(left, bottom) as [number, number];
  const [x2, y2] = viewport.convertToViewportPoint(right, top) as [number, number];
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

async function widgetBoxes(page: PDFPageProxy, viewport: PageViewport): Promise<Box[]> {
  const annotations = await page.getAnnotations();
  return annotations
    .filter(annotation => annotation.subtype === "Widget" && annotation.checkBox === true)
    .map(annotation => ({
      page: page.pageNumber,
      id: `field:${annotation.fieldName}`,
      field: annotation.fieldName as string,
      rect: toViewSpace(annotation.rect, viewport),
    }));
}

type RenderTarget = { number: number; pixelsPerPoint: number };

function printedBoxes(image: HTMLCanvasElement, target: RenderTarget): Box[] {
  const pixels = image.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, image.width, image.height);
  const size = { minPixels: BOX_POINTS.smallest * target.pixelsPerPoint, maxPixels: BOX_POINTS.largest * target.pixelsPerPoint };
  return findCheckboxes(toBitmap(pixels), size)
    .map(found => toPagePoints(found, target.pixelsPerPoint))
    .map(rect => ({ page: target.number, id: `drawn:${target.number}:${Math.round(rect.x)},${Math.round(rect.y)}`, rect }));
}

async function paintToCanvas(page: PDFPageProxy, viewport: PageViewport): Promise<HTMLCanvasElement> {
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
    const { width, height } = page.getViewport({ scale: 1 });
    return { width, height };
  });
  return {
    sizes,
    async render(pageNumber, pixelsPerPoint) {
      const page = pages[pageNumber - 1]!;
      const viewport = page.getViewport({ scale: pixelsPerPoint });
      const image = await paintToCanvas(page, viewport);
      const target = { number: pageNumber, pixelsPerPoint };
      return {
        number: pageNumber,
        size: sizes[pageNumber - 1]!,
        image,
        pixelsPerPoint,
        boxes: mergeBoxes(await widgetBoxes(page, page.getViewport({ scale: 1 })), printedBoxes(image, target)),
      };
    },
  };
}
