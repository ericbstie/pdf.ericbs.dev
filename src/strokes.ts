import type { Point, Rect, Stroke } from "./edits";

/** How far off the ink a press may land and still find the line, beyond the pointer's own reach. */
const MARGIN = 3;

/** A stroke of nothing at all — a tap with the pen — still needs a box big enough to be seen. */
const LEAST_SIZE = 6;

/** The box a stroke fills, in page points: the ink itself, and the width the pen lays it down at. */
export function strokeRect(stroke: Stroke): Rect {
  const xs = stroke.points.map(point => point.x);
  const ys = stroke.points.map(point => point.y);
  const pad = Math.max(stroke.width / 2, LEAST_SIZE / 2);
  const left = Math.min(...xs) - pad;
  const top = Math.min(...ys) - pad;
  return { x: left, y: top, width: Math.max(...xs) + pad - left, height: Math.max(...ys) + pad - top };
}

/** How far a point lies from a line drawn between two others. */
function fromSegment(point: Point, start: Point, end: Point): number {
  const along = { x: end.x - start.x, y: end.y - start.y };
  const length = along.x * along.x + along.y * along.y;
  // A segment of no length is a point, and every point is its own nearest.
  const share = length === 0 ? 0 : Math.min(1, Math.max(0, ((point.x - start.x) * along.x + (point.y - start.y) * along.y) / length));
  return Math.hypot(point.x - (start.x + along.x * share), point.y - (start.y + along.y * share));
}

/**
 * How far a point lies from the ink of a stroke. Measured against the line itself rather than the
 * box around it: a diagonal fills a box it hardly touches, and the paper inside that box is paper.
 */
export function fromStroke(stroke: Stroke, point: Point): number {
  const [first, ...rest] = stroke.points;
  if (!first) return Infinity;
  let nearest = Math.hypot(point.x - first.x, point.y - first.y);
  let previous = first;
  for (const next of rest) {
    nearest = Math.min(nearest, fromSegment(point, previous, next));
    previous = next;
  }
  return nearest;
}

/** The stroke under a point, and where two of them cross the one on top: the last one drawn. */
export function strokeAt(strokes: readonly Stroke[], point: Point, reach: number): Stroke | undefined {
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    const stroke = strokes[index]!;
    if (fromStroke(stroke, point) <= stroke.width / 2 + reach + MARGIN) return stroke;
  }
  return undefined;
}

/** The same stroke, every point of it taken the same distance from where it was. */
export function movedStroke(stroke: Stroke, by: Point): Stroke {
  return { ...stroke, points: stroke.points.map(point => ({ x: point.x + by.x, y: point.y + by.y })) };
}
