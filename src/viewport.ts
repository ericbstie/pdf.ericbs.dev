import type { Box, Point, Rect } from "./edits";

/** Widest a page is drawn, in CSS pixels per point, so a page never outgrows a comfortable reading size. */
const MAX_SCALE = 1.5;

/** Breathing room beside a page. A phone gives most of it up: there, width is the scarce thing. */
const MAX_MARGIN = 48;
const MARGIN_SHARE = 0.05;

export function fitScale(containerWidth: number, pageWidth: number): number {
  const margin = Math.min(MAX_MARGIN, containerWidth * MARGIN_SHARE);
  return Math.min(MAX_SCALE, Math.max(0.2, (containerWidth - margin) / pageWidth));
}

/** The width every page has to fit into, counted without spreading a whole file into one call. */
export function widestPage(sizes: readonly { width: number }[]): number {
  return sizes.reduce((widest, size) => Math.max(widest, size.width), 0);
}

/** Sharper than this no eye can tell, and every extra pixel is memory a phone would rather keep. */
const MAX_PIXEL_RATIO = 2;

/**
 * Past some millions of pixels a canvas quietly stops painting, soonest on a phone. Set well
 * above a letter page at full density, so only genuinely outsized pages are ever coarsened.
 */
const MAX_CANVAS_PIXELS = 8_000_000;

/** Canvas pixels per page point: as sharp as the screen deserves, as coarse as the page demands. */
export function paintDensity(scale: number, pixelRatio: number, page: { width: number; height: number }): number {
  const wanted = scale * Math.min(pixelRatio, MAX_PIXEL_RATIO);
  const affordable = Math.sqrt(MAX_CANVAS_PIXELS / (page.width * page.height));
  return Math.min(wanted, affordable);
}

export function toPagePoint(offset: Point, scale: number): Point {
  return { x: offset.x / scale, y: offset.y / scale };
}

/** How far off a small box a click may land and still count. A fingertip needs more room than a cursor. */
const REACH = { cursor: 2, finger: 8 };

export function reachFor(pointerType: string): number {
  return pointerType === "mouse" ? REACH.cursor : REACH.finger;
}

export function boxAt(boxes: readonly Box[], point: Point, reach: number): Box | undefined {
  return boxes.find(
    ({ rect }) =>
      point.x >= rect.x - reach &&
      point.x <= rect.x + rect.width + reach &&
      point.y >= rect.y - reach &&
      point.y <= rect.y + rect.height + reach,
  );
}

export function overlaps(one: Rect, other: Rect): boolean {
  return (
    one.x < other.x + other.width &&
    other.x < one.x + one.width &&
    one.y < other.y + other.height &&
    other.y < one.y + one.height
  );
}
