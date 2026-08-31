import type { Box, Marks, Point, Stroke, Writing } from "./edits";
import { checkPath, checkWidth, polylinePath } from "./paths";
import { WRITING_FONT } from "./writing";

const INK = "#0d0d0d";

/** What a page is, under everything printed on it. */
const PAPER = "#ffffff";

/** Light enough to read as a highlight over anything already printed there. */
const HOVER = "rgba(59, 130, 246, 0.18)";

/** Helvetica's cap height is 0.717em, so its middle sits this far above the baseline. */
const CAP_MIDDLE = 0.358;

function strokeInk(context: CanvasRenderingContext2D, stroke: Stroke): void {
  context.lineWidth = stroke.width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke(new Path2D(polylinePath(stroke.points)));
}

function writeInk(context: CanvasRenderingContext2D, writing: Writing): void {
  context.font = `${writing.size}px ${WRITING_FONT}`;
  context.textBaseline = "alphabetic";
  context.fillText(writing.text, writing.at.x, writing.at.y + writing.size * CAP_MIDDLE);
}

function tickInk(context: CanvasRenderingContext2D, box: Box): void {
  context.lineWidth = checkWidth(box.rect);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke(new Path2D(checkPath(box.rect)));
}

/**
 * A tick the file arrived with is in the painting of the page itself, so taking it back means
 * covering it. Only the inside of the box is covered: its outline is not part of the tick. The
 * saved file goes nowhere near here — there the field is cleared and the file redraws it.
 */
function clearInk(context: CanvasRenderingContext2D, box: Box): void {
  const { x, y, width, height } = box.rect;
  const outline = checkWidth(box.rect);
  context.fillStyle = PAPER;
  context.fillRect(x + outline, y + outline, width - outline * 2, height - outline * 2);
  context.fillStyle = INK;
}

function highlight(context: CanvasRenderingContext2D, box: Box): void {
  context.fillStyle = HOVER;
  const { x, y, width, height } = box.rect;
  context.fillRect(x - 1, y - 1, width + 2, height + 2);
  context.fillStyle = INK;
}

export type PagePaint = {
  image: CanvasImageSource;
  pixelsPerPoint: number;
  /** Which page point the image's top-left corner is, for a canvas holding one part of a page. */
  at?: Point;
  marks: Marks;
  hovered?: Box;
};

export function paintPage(context: CanvasRenderingContext2D, paint: PagePaint): void {
  const at = paint.at ?? { x: 0, y: 0 };
  const density = paint.pixelsPerPoint;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.drawImage(paint.image, 0, 0);
  // Marks are kept in page points, so the canvas takes on the page's own measure and corner.
  context.setTransform(density, 0, 0, density, -at.x * density, -at.y * density);
  context.strokeStyle = INK;
  context.fillStyle = INK;
  paint.marks.unticks.forEach(box => clearInk(context, box));
  if (paint.hovered) highlight(context, paint.hovered);
  paint.marks.strokes.forEach(stroke => strokeInk(context, stroke));
  paint.marks.writings.forEach(writing => writeInk(context, writing));
  paint.marks.ticks.forEach(box => tickInk(context, box));
}
