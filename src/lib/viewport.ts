import type { Box, Point, Rect } from "./edits";

/** Widest a page is drawn, in CSS pixels per point, so a page never outgrows a comfortable reading size. */
const MAX_SCALE = 1.5;

/** Breathing room beside a page. A phone gives most of it up: there, width is the scarce thing. */
const MAX_MARGIN = 48;
const MARGIN_SHARE = 0.05;

export function fitScale(containerWidth: number, pageWidth: number): number {
  // A file with no pages has no width to fit; anything would do, since nothing will be laid out.
  if (pageWidth <= 0) return 1;
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

type Area = { width: number; height: number };

/** One canvas pixel per screen pixel at the size the page is drawn: sharper than this is wasted. */
function wantedDensity(scale: number, pixelRatio: number): number {
  return scale * Math.min(pixelRatio, MAX_PIXEL_RATIO);
}

/** The most a single canvas can hold across an area this big. */
function affordableDensity(area: Area): number {
  return Math.sqrt(MAX_CANVAS_PIXELS / (area.width * area.height));
}

/** Canvas pixels per page point: as sharp as the screen deserves, as coarse as the area demands. */
export function paintDensity(scale: number, pixelRatio: number, area: Area): number {
  return Math.min(wantedDensity(scale, pixelRatio), affordableDensity(area));
}

/**
 * Whether one canvas can still hold the whole page as sharply as the screen deserves. Zoomed in
 * far enough it cannot, and only the part on screen can be painted at full sharpness.
 */
export function wholePageIsSharp(scale: number, pixelRatio: number, page: Area): boolean {
  return affordableDensity(page) >= wantedDensity(scale, pixelRatio);
}

/** A rectangle as the browser measures one, in client pixels. */
type Frame = { left: number; top: number; width: number; height: number };

/** The part of a page that is on screen, in page points, or nothing when none of it is. */
export function visiblePart(sheet: Frame, window: Frame, scale: number): Rect | null {
  const left = Math.max(sheet.left, window.left);
  const top = Math.max(sheet.top, window.top);
  const right = Math.min(sheet.left + sheet.width, window.left + window.width);
  const bottom = Math.min(sheet.top + sheet.height, window.top + window.height);
  if (right <= left || bottom <= top) return null;
  return {
    x: (left - sheet.left) / scale,
    y: (top - sheet.top) / scale,
    width: (right - left) / scale,
    height: (bottom - top) / scale,
  };
}

/** How much is painted beyond the edges of the screen, as a share of what is on it. */
const BAND = 0.3;

/** What is on screen plus a band around it, clipped to the page, so a nudge is not a repaint. */
export function withBand(visible: Rect, page: Area): Rect {
  const x = Math.max(0, visible.x - visible.width * BAND);
  const y = Math.max(0, visible.y - visible.height * BAND);
  const right = Math.min(page.width, visible.x + visible.width * (1 + BAND));
  const bottom = Math.min(page.height, visible.y + visible.height * (1 + BAND));
  return { x, y, width: right - x, height: bottom - y };
}

/** Past this much painting for nothing, a part that still covers the screen is repainted smaller. */
const MOST_SLACK = 4;

/** Whether a painted part is still worth keeping: it covers what is on screen, and not far more. */
export function stillFits(part: Rect, visible: Rect): boolean {
  const around =
    part.x <= visible.x &&
    part.y <= visible.y &&
    part.x + part.width >= visible.x + visible.width &&
    part.y + part.height >= visible.y + visible.height;
  return around && part.width * part.height <= visible.width * visible.height * MOST_SLACK;
}

export function toPagePoint(offset: Point, scale: number): Point {
  return { x: offset.x / scale, y: offset.y / scale };
}

/** How far off a small box a click may land and still count. A fingertip needs more room than a cursor. */
const REACH = { cursor: 2, finger: 8 };

export function reachFor(pointerType: string): number {
  return pointerType === "mouse" ? REACH.cursor : REACH.finger;
}

/** Whether a point lands on a rectangle, allowing for however far off the pointer may be. */
export function within(rect: Rect, point: Point, reach: number): boolean {
  return (
    point.x >= rect.x - reach &&
    point.x <= rect.x + rect.width + reach &&
    point.y >= rect.y - reach &&
    point.y <= rect.y + rect.height + reach
  );
}

export function boxAt(boxes: readonly Box[], point: Point, reach: number): Box | undefined {
  return boxes.find(({ rect }) => within(rect, point, reach));
}

export function overlaps(one: Rect, other: Rect): boolean {
  return (
    one.x < other.x + other.width &&
    other.x < one.x + one.width &&
    one.y < other.y + other.height &&
    other.y < one.y + one.height
  );
}
