import { LineCapStyle, PDFDocument, type PDFFont, type PDFForm, type PDFPage, StandardFonts, degrees, rgb } from "pdf-lib";
import type { Box, Marks, Stroke, Writing } from "../lib/edits";
import { checkPath, checkWidth, polylinePath } from "../lib/paths";
import { type PageBox, toUserPoint } from "./space";
import { keepEncodable } from "../lib/text";

const INK = rgb(0.05, 0.05, 0.05);

/** Helvetica's cap height is 0.717em, so its middle sits this far above the baseline. */
const CAP_MIDDLE = 0.358;

/** Where a page's view space lands in the file: the corner it starts from and the turn it takes. */
type Sheet = { page: PDFPage; box: PageBox; angle: number; corner: { x: number; y: number } };

function sheetOf(page: PDFPage): Sheet {
  const box = page.getCropBox();
  const angle = page.getRotation().angle;
  return { page, box, angle, corner: toUserPoint({ x: 0, y: 0 }, box, angle) };
}

/** Places an SVG path so its own top-left origin sits on the page's, however the page is turned. */
function drawPath(sheet: Sheet, path: string, width: number): void {
  sheet.page.drawSvgPath(path, {
    x: sheet.corner.x,
    y: sheet.corner.y,
    rotate: degrees(sheet.angle),
    borderColor: INK,
    borderWidth: width,
    borderLineCap: LineCapStyle.Round,
  });
}

function drawStroke(sheet: Sheet, stroke: Stroke): void {
  drawPath(sheet, polylinePath(stroke.points), stroke.width);
}

function stampTick(sheet: Sheet, box: Box): void {
  drawPath(sheet, checkPath(box.rect), checkWidth(box.rect));
}

function drawWriting(sheet: Sheet, writing: Writing, font: PDFFont): void {
  const baseline = toUserPoint(
    { x: writing.at.x, y: writing.at.y + writing.size * CAP_MIDDLE },
    sheet.box,
    sheet.angle,
  );
  sheet.page.drawText(keepEncodable(writing.text), {
    x: baseline.x,
    y: baseline.y,
    size: writing.size,
    font,
    color: INK,
    rotate: degrees(sheet.angle),
  });
}

/** Reports whether the file carries a checkbox field of that name to put in that state. */
function setField(form: PDFForm, name: string, ticked: boolean): boolean {
  try {
    const checkBox = form.getCheckBox(name);
    if (ticked) checkBox.check();
    else checkBox.uncheck();
    return true;
  } catch {
    return false;
  }
}

function tickBox(form: PDFForm, sheet: Sheet, box: Box): void {
  if (box.field && setField(form, box.field, true)) return;
  stampTick(sheet, box);
}

/**
 * Clearing reaches a field and no further: the file drew that tick and the file redraws the box
 * without it. A printed tick is ink on the page like any other, and painting over somebody else's
 * scan is a different kind of edit from adding to it — so a printed box is only ever ticked.
 *
 * Reports whether the tick came back out. A tick has no second way in: where a field refuses to
 * be ticked the mark is stamped over it instead, but nothing can stand in for taking one back,
 * and the saved copy would otherwise disagree with the screen without saying so.
 */
function untickBox(form: PDFForm, box: Box): boolean {
  return box.field !== undefined && setField(form, box.field, false);
}

/** Paints marks onto the pages they belong to, ignoring any that point past the end of the file. */
function paintEach<Mark extends { page: number }>(
  sheets: readonly Sheet[],
  marks: readonly Mark[],
  paint: (sheet: Sheet, mark: Mark) => void,
): void {
  for (const mark of marks) {
    const sheet = sheets[mark.page - 1];
    if (sheet) paint(sheet, mark);
  }
}

/** The saved file, and how many ticks it would not let be taken back out of it. */
export type Saved = { bytes: Uint8Array; refused: number };

export async function exportPdf(source: Uint8Array, marks: Marks): Promise<Saved> {
  const doc = await PDFDocument.load(source, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  const sheets = doc.getPages().map(sheetOf);
  paintEach(sheets, marks.strokes, drawStroke);
  paintEach(sheets, marks.writings, (sheet, writing) => drawWriting(sheet, writing, font));
  paintEach(sheets, marks.ticks, (sheet, box) => tickBox(form, sheet, box));
  let refused = 0;
  paintEach(sheets, marks.unticks, (_sheet, box) => {
    if (!untickBox(form, box)) refused += 1;
  });
  return { bytes: await doc.save(), refused };
}
