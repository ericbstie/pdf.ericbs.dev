import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import * as workerHandler from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { findCheckboxes, toBitmap, toPagePoints } from "./detect";
import type { Box, Point, Rect } from "./edits";
import { overlaps } from "./viewport";

/** pdf.js picks this up and parses on this thread, sparing us a separately hosted worker file. */
(globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = workerHandler;

/** The range a printed checkbox falls in, in points. */
const BOX_POINTS = { smallest: 7, largest: 26 };

/**
 * What the reader is allowed to do with a file it has never seen before. Both are pdf.js defaults
 * today, and both are the kind of default that a dependency bump could quietly flip back.
 */
const READER_LIMITS = {
  /** Never build code out of file contents, so the page can refuse `unsafe-eval` outright. */
  isEvalSupported: false,
  /** XFA is a second document format, XML and script shaped, that this editor draws none of. */
  enableXfa: false,
};

/** More pages than anyone fills in by hand, and few enough that a crafted file cannot exhaust the tab. */
const MAX_PAGES = 2000;

type PageViewport = ReturnType<PDFPageProxy["getViewport"]>;

export type PageSize = { width: number; height: number };

export type RenderedPage = {
  number: number;
  size: PageSize;
  image: HTMLCanvasElement;
  pixelsPerPoint: number;
  boxes: Box[];
};

/** One part of a page, painted on its own, and which page point its top-left corner is. */
export type RenderedPart = {
  image: HTMLCanvasElement;
  pixelsPerPoint: number;
  at: Point;
};

export type OpenPdf = {
  sizes: readonly PageSize[];
  render(pageNumber: number, pixelsPerPoint: number): Promise<RenderedPage>;
  /** Zoomed in past what one canvas can hold, only the part on screen can be painted sharply. */
  renderPart(pageNumber: number, pixelsPerPoint: number, part: Rect): Promise<RenderedPart>;
};

/** Why a file would not open, in terms the editor can put in front of the person who chose it. */
export type OpenProblem = "encrypted" | "too-many-pages" | "unreadable";

export type Opened = { ok: true; pdf: OpenPdf } | { ok: false; problem: OpenProblem };

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
    .map(rect => ({ page: target.number, rect }));
}

/**
 * Paints as much of the viewport as the canvas is given room for, so a canvas smaller than the
 * page holds the part the viewport was offset to. Asking to read the pixels back costs the
 * graphics card's help, so only the one painting whose pixels are searched for boxes asks.
 */
async function paintToCanvas(
  page: PDFPageProxy,
  viewport: PageViewport,
  size: { width: number; height: number },
  readable: boolean,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(size.width);
  canvas.height = Math.ceil(size.height);
  const context = canvas.getContext("2d", { willReadFrequently: readable })!;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas;
}

/** Widgets win: a form checkbox and the square printed under it are the same box. */
function mergeBoxes(widgets: readonly Box[], printed: readonly Box[]): Box[] {
  return [...widgets, ...printed.filter(box => !widgets.some(widget => overlaps(widget.rect, box.rect)))];
}

async function boxesOn(page: PDFPageProxy, image: HTMLCanvasElement, pixelsPerPoint: number): Promise<Box[]> {
  const widgets = await widgetBoxes(page, page.getViewport({ scale: 1 }));
  return mergeBoxes(widgets, printedBoxes(image, { number: page.pageNumber, pixelsPerPoint }));
}

function sizeOf(page: PDFPageProxy): PageSize {
  const { width, height } = page.getViewport({ scale: 1 });
  return { width, height };
}

async function readerFor(doc: PDFDocumentProxy): Promise<OpenPdf> {
  const pages = await Promise.all(Array.from({ length: doc.numPages }, (_, index) => doc.getPage(index + 1)));
  const sizes = pages.map(sizeOf);
  /**
   * Found once per page and kept. Detection is the costly half of a render, a box does not move,
   * and its coordinates are in page points either way — so the answer holds however finely the
   * page is next painted, which also keeps a box's id the same from one painting to the next.
   */
  const found = new Map<number, Box[]>();
  return {
    sizes,
    async render(pageNumber, pixelsPerPoint) {
      const page = pages[pageNumber - 1]!;
      const viewport = page.getViewport({ scale: pixelsPerPoint });
      const image = await paintToCanvas(page, viewport, viewport, !found.has(pageNumber));
      const boxes = found.get(pageNumber) ?? (await boxesOn(page, image, pixelsPerPoint));
      found.set(pageNumber, boxes);
      return { number: pageNumber, size: sizes[pageNumber - 1]!, image, pixelsPerPoint, boxes };
    },
    async renderPart(pageNumber, pixelsPerPoint, part) {
      const page = pages[pageNumber - 1]!;
      // The offset moves the page under the canvas, which then holds the part that lands on it.
      const viewport = page.getViewport({
        scale: pixelsPerPoint,
        offsetX: -part.x * pixelsPerPoint,
        offsetY: -part.y * pixelsPerPoint,
      });
      const size = { width: part.width * pixelsPerPoint, height: part.height * pixelsPerPoint };
      return { image: await paintToCanvas(page, viewport, size, false), pixelsPerPoint, at: { x: part.x, y: part.y } };
    },
  };
}

function problemOf(error: unknown): OpenProblem {
  return error instanceof Error && error.name === "PasswordException" ? "encrypted" : "unreadable";
}

/** Reads a file nobody has vouched for, and names what stopped it rather than throwing. */
export async function openPdf(bytes: Uint8Array): Promise<Opened> {
  try {
    const doc = await pdfjs.getDocument({ data: bytes, ...READER_LIMITS }).promise;
    if (doc.numPages < 1) return { ok: false, problem: "unreadable" };
    if (doc.numPages > MAX_PAGES) return { ok: false, problem: "too-many-pages" };
    return { ok: true, pdf: await readerFor(doc) };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}
