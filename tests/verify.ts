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

/** Where a PDF-space point shows up on screen, according to pdf.js itself. */
export async function toViewPoint(pdf: Uint8Array, userPoint: { x: number; y: number }, pageNumber = 1) {
  const pages = await readPagesOf(pdf);
  const viewport = pages[pageNumber - 1]!.getViewport({ scale: 1 });
  const [x, y] = viewport.convertToViewportPoint(userPoint.x, userPoint.y);
  return { x: x!, y: y! };
}

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Row-vector product: a point runs through `first`, then `then`. */
function combine(first: Matrix, then: Matrix): Matrix {
  const [a, b, c, d, e, f] = first;
  const [A, B, C, D, E, F] = then;
  return [
    a * A + b * C,
    a * B + b * D,
    c * A + d * C,
    c * B + d * D,
    e * A + f * C + E,
    e * B + f * D + F,
  ];
}

function apply(matrix: Matrix, point: { x: number; y: number }) {
  const [a, b, c, d, e, f] = matrix;
  return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
}

/** The corner of each painted path's bounding box, in PDF user space. Exact for one-point paths. */
export async function readPathCorners(pdf: Uint8Array, pageNumber = 1): Promise<{ x: number; y: number }[]> {
  const pages = await readPagesOf(pdf);
  const { fnArray, argsArray } = await pages[pageNumber - 1]!.getOperatorList();
  const stack: Matrix[] = [];
  let current: Matrix = IDENTITY;
  const corners: { x: number; y: number }[] = [];
  fnArray.forEach((fn: number, index: number) => {
    const args = argsArray[index] as never[];
    if (fn === pdfjs.OPS.save) stack.push(current);
    if (fn === pdfjs.OPS.restore) current = stack.pop() ?? IDENTITY;
    if (fn === pdfjs.OPS.transform) current = combine(args as unknown as Matrix, current);
    if (fn === pdfjs.OPS.constructPath) {
      const [x, y] = args[2] as unknown as number[];
      corners.push(apply(current, { x: x!, y: y! }));
    }
  });
  return corners;
}
