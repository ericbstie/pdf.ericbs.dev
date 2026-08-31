import type { Point } from "./edits";

/** The page area the viewer shows, in PDF user space. */
export type PageBox = { x: number; y: number; width: number; height: number };

function turnsOf(rotation: number): number {
  return (((rotation % 360) + 360) % 360) as 0 | 90 | 180 | 270;
}

/** Moves a point from view space (top-left origin, y down, page already turned) into PDF user space. */
export function toUserPoint(view: Point, box: PageBox, rotation: number): Point {
  const turns = turnsOf(rotation);
  if (turns === 90) return { x: box.x + view.y, y: box.y + view.x };
  if (turns === 180) return { x: box.x + box.width - view.x, y: box.y + view.y };
  if (turns === 270) return { x: box.x + box.width - view.y, y: box.y + box.height - view.x };
  return { x: box.x + view.x, y: box.y + box.height - view.y };
}
