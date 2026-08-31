import { LineCapStyle, PDFDocument, type PDFFont, type PDFForm, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { Box, Marks, Stroke, Writing } from "./edits";
import { checkPath, checkWidth, polylinePath } from "./paths";
import { keepEncodable } from "./text";

const INK = rgb(0.05, 0.05, 0.05);

/** Helvetica's cap height is 0.717em, so its middle sits this far above the baseline. */
const CAP_MIDDLE = 0.358;

/** Anchors an SVG path's origin at the page's top-left corner, y downward. */
function pageSpace(page: PDFPage) {
  return { x: 0, y: page.getHeight() };
}

function drawStroke(page: PDFPage, stroke: Stroke): void {
  page.drawSvgPath(polylinePath(stroke.points), {
    ...pageSpace(page),
    borderColor: INK,
    borderWidth: stroke.width,
    borderLineCap: LineCapStyle.Round,
  });
}

function drawWriting(page: PDFPage, writing: Writing, font: PDFFont): void {
  page.drawText(keepEncodable(writing.text), {
    x: writing.at.x,
    y: page.getHeight() - writing.at.y - writing.size * CAP_MIDDLE,
    size: writing.size,
    font,
    color: INK,
  });
}

function stampTick(page: PDFPage, box: Box): void {
  page.drawSvgPath(checkPath(box.rect), {
    ...pageSpace(page),
    borderColor: INK,
    borderWidth: checkWidth(box.rect),
    borderLineCap: LineCapStyle.Round,
  });
}

/** Reports whether the file carries a checkbox field of that name to tick. */
function tickField(form: PDFForm, name: string): boolean {
  try {
    form.getCheckBox(name).check();
    return true;
  } catch {
    return false;
  }
}

function tickBox(form: PDFForm, page: PDFPage, box: Box): void {
  if (box.field && tickField(form, box.field)) return;
  stampTick(page, box);
}

/** Paints marks onto the pages they belong to, ignoring any that point past the end of the file. */
function paintEach<Mark extends { page: number }>(
  pages: readonly PDFPage[],
  marks: readonly Mark[],
  paint: (page: PDFPage, mark: Mark) => void,
): void {
  for (const mark of marks) {
    const page = pages[mark.page - 1];
    if (page) paint(page, mark);
  }
}

export async function exportPdf(source: Uint8Array, marks: Marks): Promise<Uint8Array> {
  const doc = await PDFDocument.load(source);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  const pages = doc.getPages();
  paintEach(pages, marks.strokes, drawStroke);
  paintEach(pages, marks.writings, (page, writing) => drawWriting(page, writing, font));
  paintEach(pages, marks.ticks, (page, box) => tickBox(form, page, box));
  return doc.save();
}
