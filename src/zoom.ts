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

/** Which point of the pages a place on the screen is over, in the pages' own points. */
export function heldAt(corner: Point, focus: Point, scale: number): Point {
  return { x: (focus.x - corner.x) / scale, y: (focus.y - corner.y) / scale };
}

/**
 * Where the pages' top-left corner has to be for the point the fingers came down on to be under
 * them, at the size the pages are now. Aimed at afresh on every touch rather than nudged along
 * from the last one: a nudge that the scroll had no room for is a nudge lost, and the pages spend
 * the beginning of a pinch with no room to give — a page smaller than the window does not scroll.
 */
export function cornerFor(focus: Point, held: Point, scale: number): Point {
  return { x: focus.x - held.x * scale, y: focus.y - held.y * scale };
}

/**
 * The size the pages are laid out at, kept in the stylesheet rather than in React. A pinch reports
 * touches faster than a document of pages can be rendered again, and every one of them has to
 * land: written here, the browser resizes every page from one property, and what the fingers ask
 * for is on screen within the event that asked for it.
 */
export const SCALE = "--scale";

/** A length on the page, in the pages' own points, written so it grows and shrinks with them. */
export function atScale(points: number): string {
  return `calc(var(${SCALE}, 1) * ${points}px)`;
}
