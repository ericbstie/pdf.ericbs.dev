import { PDFCheckBox, PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

/** A text run as it sits on the saved page, in PDF user space. */
export type PlacedText = { page: number; text: string; x: number; y: number };

function toPlacedText(item: { str: string; transform: number[] }, page: number): PlacedText {
  return { page, text: item.str, x: item.transform[4]!, y: item.transform[5]! };
}

async function readPagesOf(pdf: Uint8Array) {
  const doc = await pdfjs.getDocument({ data: Uint8Array.from(pdf) }).promise;
  const numbers = Array.from({ length: doc.numPages }, (_, i) => i + 1);
  return Promise.all(numbers.map(n => doc.getPage(n)));
}

export async function readTextPlacements(pdf: Uint8Array): Promise<PlacedText[]> {
  const pages = await readPagesOf(pdf);
  const perPage = await Promise.all(pages.map(page => page.getTextContent()));
  return perPage.flatMap((content, index) =>
    content.items
      .filter((item: any) => "str" in item && item.str.trim() !== "")
      .map((item: any) => toPlacedText(item, index + 1)),
  );
}

export async function readCheckboxStates(pdf: Uint8Array): Promise<Map<string, boolean>> {
  const doc = await PDFDocument.load(pdf);
  const boxes = doc.getForm().getFields().filter(field => field instanceof PDFCheckBox);
  return new Map(boxes.map(box => [box.getName(), box.isChecked()]));
}

/** How many vector paths a page paints, split by how they are painted — enough to tell ink from a blob. */
export type PaintCounts = { constructed: number; stroked: number; filled: number };

/** pdf.js folds a path's paint operator into the arguments of the op that builds it. */
function paintOperatorsOf(operators: { fnArray: number[]; argsArray: unknown[] }): number[] {
  return operators.fnArray.flatMap((fn, index) =>
    fn === pdfjs.OPS.constructPath ? [(operators.argsArray[index] as number[])[0]!] : [],
  );
}

export async function countPaintOps(pdf: Uint8Array, pageNumber = 1): Promise<PaintCounts> {
  const pages = await readPagesOf(pdf);
  const painted = paintOperatorsOf(await pages[pageNumber - 1]!.getOperatorList());
  const tally = (...ops: number[]) => painted.filter(op => ops.includes(op)).length;
  const { stroke, closeStroke, fill, eoFill, fillStroke } = pdfjs.OPS;
  return {
    constructed: painted.length,
    stroked: tally(stroke, closeStroke, fillStroke),
    filled: tally(fill, eoFill, fillStroke),
  };
}
