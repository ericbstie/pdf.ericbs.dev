import type { Box, Point, Rect } from "./edits";

/** Widest a page is drawn, in CSS pixels per point, so a page never outgrows a comfortable reading size. */
const MAX_SCALE = 1.5;
const PAGE_MARGIN = 48;

export function fitScale(containerWidth: number, pageWidth: number): number {
  return Math.min(MAX_SCALE, Math.max(0.2, (containerWidth - PAGE_MARGIN) / pageWidth));
}

export function toPagePoint(offset: Point, scale: number): Point {
  return { x: offset.x / scale, y: offset.y / scale };
}

/** Small boxes are easy to miss, so clicks land within a couple of points of one. */
const SLOP = 2;

export function boxAt(boxes: readonly Box[], point: Point): Box | undefined {
  return boxes.find(
    ({ rect }) =>
      point.x >= rect.x - SLOP &&
      point.x <= rect.x + rect.width + SLOP &&
      point.y >= rect.y - SLOP &&
      point.y <= rect.y + rect.height + SLOP,
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
