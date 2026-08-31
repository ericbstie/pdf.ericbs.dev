import type { Point } from "./edits";

/** How far in and out the pages go, as a multiple of the size they are first laid out at. */
export const ZOOM = { least: 0.5, most: 5 };

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM.most, Math.max(ZOOM.least, zoom));
}

/**
 * A wheel reports a distance and zoom wants a factor, so the distance becomes an exponent: two
 * notches the same way multiply, and a notch back the other way undoes one exactly.
 */
const ZOOM_PER_PIXEL = 0.002;

/** What a wheel counting in lines or pages means in pixels, since either spelling is allowed. */
const PIXELS = { line: 16, page: 400 };

/** As far as one event may take the zoom, so a wheel that reports a whole page still lands softly. */
const MOST_AT_ONCE = 200;

export function wheelFactor(wheel: { deltaY: number; deltaMode: number }): number {
  const perUnit = wheel.deltaMode === 1 ? PIXELS.line : wheel.deltaMode === 2 ? PIXELS.page : 1;
  const pixels = Math.max(-MOST_AT_ONCE, Math.min(MOST_AT_ONCE, wheel.deltaY * perUnit));
  return Math.exp(-pixels * ZOOM_PER_PIXEL);
}

/** One finger of a pinch, as the browser hands it over. */
export type Touching = { clientX: number; clientY: number };

/** How far apart the fingers are: the pinch itself, before and after, is the whole of the gesture. */
export function spreadOf(one: Touching, other: Touching): number {
  return Math.hypot(one.clientX - other.clientX, one.clientY - other.clientY);
}

export function midpointOf(one: Touching, other: Touching): Point {
  return { x: (one.clientX + other.clientX) / 2, y: (one.clientY + other.clientY) / 2 };
}

/**
 * Where the pages' top-left corner has to end up for whatever is under the fingers to stay under
 * them. Everything between that corner and the fingers grows by the same ratio the pages do, so
 * the corner backs away from them in proportion.
 */
export function anchorFor(corner: Point, focus: Point, ratio: number): Point {
  return { x: focus.x - (focus.x - corner.x) * ratio, y: focus.y - (focus.y - corner.y) * ratio };
}
