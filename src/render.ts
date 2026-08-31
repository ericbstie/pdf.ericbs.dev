import type { Box, Marks, Stroke, Writing } from "./edits";
import { checkPath, checkWidth, polylinePath } from "./paths";

const INK = "#0d0d0d";

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

export function writeInk(context: CanvasRenderingContext2D, writing: Writing): void {
  context.font = `${writing.size}px Helvetica, Arial, sans-serif`;
  context.textBaseline = "alphabetic";
  context.fillText(writing.text, writing.at.x, writing.at.y + writing.size * CAP_MIDDLE);
}

function tickInk(context: CanvasRenderingContext2D, box: Box): void {
  context.lineWidth = checkWidth(box.rect);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke(new Path2D(checkPath(box.rect)));
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
  marks: Marks;
  hovered?: Box;
};

export function paintPage(context: CanvasRenderingContext2D, paint: PagePaint): void {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.drawImage(paint.image, 0, 0);
  context.setTransform(paint.pixelsPerPoint, 0, 0, paint.pixelsPerPoint, 0, 0);
  context.strokeStyle = INK;
  context.fillStyle = INK;
  if (paint.hovered) highlight(context, paint.hovered);
  paint.marks.strokes.forEach(stroke => strokeInk(context, stroke));
  paint.marks.writings.forEach(writing => writeInk(context, writing));
  paint.marks.ticks.forEach(box => tickInk(context, box));
}
