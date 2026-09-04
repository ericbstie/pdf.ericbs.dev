import type { Point, Rect, Stroke } from "../../lib/edits";

/** How far off the ink a press may land and still find the line, beyond the pointer's own reach. */
const MARGIN = 3;

/** A stroke of nothing at all — a tap with the pen — still needs a box big enough to be seen. */
const LEAST_SIZE = 6;

/**
 * The box a stroke fills, in page points: the ink itself, and the width the pen lays it down at.
 *
 * Walked rather than spread into `Math.min`: a stroke holds a point for every report the pointer
 * made, and a long enough drag has more of them than an engine will take arguments.
 */
export function strokeRect(stroke: Stroke): Rect {
  const pad = Math.max(stroke.width / 2, LEAST_SIZE / 2);
  const first = stroke.points[0];
  // A stroke is only ever put down with the point the pen came down on, so this is nothing that
  // happens; a box of no size is what an empty one would fill.
  if (!first) return { x: 0, y: 0, width: 0, height: 0 };
  const edges = { left: first.x, top: first.y, right: first.x, bottom: first.y };
  for (let index = 1; index < stroke.points.length; index += 1) {
    const point = stroke.points[index]!;
    edges.left = Math.min(edges.left, point.x);
    edges.top = Math.min(edges.top, point.y);
    edges.right = Math.max(edges.right, point.x);
    edges.bottom = Math.max(edges.bottom, point.y);
  }
  return {
    x: edges.left - pad,
    y: edges.top - pad,
    width: edges.right - edges.left + pad * 2,
    height: edges.bottom - edges.top + pad * 2,
  };
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
  const first = stroke.points[0];
  if (!first) return Infinity;
  let nearest = Math.hypot(point.x - first.x, point.y - first.y);
  for (let index = 1; index < stroke.points.length; index += 1) {
    nearest = Math.min(nearest, fromSegment(point, stroke.points[index - 1]!, stroke.points[index]!));
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
