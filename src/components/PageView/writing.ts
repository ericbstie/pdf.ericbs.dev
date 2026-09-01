import type { Point, Rect, Writing } from "../../lib/edits";
import { within } from "../../lib/viewport";

/** The one font a writing is typed in, painted in and printed in, so all three agree on its width. */
export const WRITING_FONT = "Helvetica, Arial, sans-serif";

/** Narrower than this there is nothing to take hold of, however few letters a writing has. */
const LEAST_WIDTH = 0.5;

/**
 * The box a writing fills, in page points. `at` is the middle of the cap height, which is where the
 * ink is drawn from and where the caret is placed, so the box, the caret and the letters coincide.
 */
export function writingRect(writing: Writing, width: number): Rect {
  return {
    x: writing.at.x,
    y: writing.at.y - writing.size / 2,
    width: Math.max(width, writing.size * LEAST_WIDTH),
    height: writing.size,
  };
}

/** The writing under a point, and where two of them overlap the one on top: the last one written. */
export function writingAt(
  writings: readonly Writing[],
  rectOf: (writing: Writing) => Rect,
  point: Point,
  reach: number,
): Writing | undefined {
  for (let index = writings.length - 1; index >= 0; index -= 1) {
    const writing = writings[index]!;
    if (within(rectOf(writing), point, reach)) return writing;
  }
  return undefined;
}

/** Roughly what Helvetica averages, for a browser that will not hand over a canvas to measure on. */
const AVERAGE_WIDTH = 0.5;

/** One canvas kept aside as a ruler. Nothing is ever painted on it. */
let ruler: CanvasRenderingContext2D | null | undefined;

/** How wide a writing is drawn, in page points, measured in the font it will be drawn in. */
export function textWidth(text: string, size: number): number {
  if (ruler === undefined) ruler = document.createElement("canvas").getContext("2d");
  if (!ruler) return text.length * size * AVERAGE_WIDTH;
  ruler.font = `${size}px ${WRITING_FONT}`;
  return ruler.measureText(text).width;
}
