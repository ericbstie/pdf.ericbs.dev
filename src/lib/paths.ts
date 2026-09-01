import type { Point, Rect } from "./edits";

/** Two decimals keeps the path readable and well inside PDF and canvas precision. */
function round(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function segment(point: Point): string {
  return `${round(point.x)} ${round(point.y)}`;
}

/** An SVG path through the points, understood by both Path2D and pdf-lib. */
export function polylinePath(points: readonly Point[]): string {
  const [start, ...rest] = points;
  if (!start) return "";
  const tail = rest.length > 0 ? rest : [start];
  return `M ${segment(start)} ${tail.map(point => `L ${segment(point)}`).join(" ")}`;
}

/** A tick sized to sit inside the box it marks. */
export function checkPath(box: Rect): string {
  const corner = { x: box.x + box.width * 0.22, y: box.y + box.height * 0.52 };
  const bottom = { x: box.x + box.width * 0.43, y: box.y + box.height * 0.76 };
  const tip = { x: box.x + box.width * 0.8, y: box.y + box.height * 0.24 };
  return polylinePath([corner, bottom, tip]);
}

export function checkWidth(box: Rect): number {
  return Math.max(1, Math.min(box.width, box.height) * 0.14);
}
