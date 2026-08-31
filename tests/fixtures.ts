import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

export type Rect = { x: number; y: number; width: number; height: number };

/** Points, US Letter. Fixtures share one size so tests can convert coordinates once. */
export const PAGE_SIZE = { width: 612, height: 792 } as const;

/** Boxes painted as bare vector outlines, as a scanned or flattened form would carry them. */
export const FLAT_BOXES: readonly Rect[] = [
  { x: 72, y: 700, width: 14, height: 14 },
  { x: 72, y: 660, width: 14, height: 14 },
  { x: 72, y: 620, width: 14, height: 14 },
];

/** Boxes backed by AcroForm checkbox widgets, keyed by field name. */
export const FORM_BOXES: readonly (Rect & { name: string })[] = [
  { name: "agree", x: 72, y: 700, width: 14, height: 14 },
  { name: "subscribe", x: 72, y: 660, width: 14, height: 14 },
];

const EPOCH = new Date(0);

function stampFixedDates(doc: PDFDocument): void {
  doc.setCreationDate(EPOCH);
  doc.setModificationDate(EPOCH);
}

async function startPage(): Promise<{ doc: PDFDocument; page: ReturnType<PDFDocument["addPage"]> }> {
  const doc = await PDFDocument.create();
  stampFixedDates(doc);
  const page = doc.addPage([PAGE_SIZE.width, PAGE_SIZE.height]);
  return { doc, page };
}

export async function buildPlainPdf(pageCount = 1): Promise<Uint8Array> {
  const { doc, page } = await startPage();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Rental agreement", { x: 72, y: 740, size: 18, font });
  for (let extra = 1; extra < pageCount; extra += 1) {
    const next = doc.addPage([PAGE_SIZE.width, PAGE_SIZE.height]);
    next.drawText(`Schedule ${extra}`, { x: 72, y: 740, size: 18, font });
  }
  return doc.save();
}

export async function buildFlatCheckboxPdf(): Promise<Uint8Array> {
  const { doc, page } = await startPage();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Rental agreement", { x: 72, y: 740, size: 18, font });
  FLAT_BOXES.forEach((box, index) => {
    page.drawRectangle({ ...box, borderWidth: 1, borderColor: rgb(0, 0, 0) });
    page.drawText(`Clause ${index + 1}`, { x: box.x + 24, y: box.y + 3, size: 11, font });
  });
  return doc.save();
}

/** `ticked` names the fields the file is to arrive with already ticked, as a part-filled form does. */
export async function buildFormCheckboxPdf(ticked: readonly string[] = []): Promise<Uint8Array> {
  const { doc, page } = await startPage();
  const form = doc.getForm();
  for (const { name, ...rect } of FORM_BOXES) {
    const box = form.createCheckBox(name);
    box.addToPage(page, rect);
    if (ticked.includes(name)) box.check();
  }
  return doc.save();
}

export async function buildRotatedPdf(rotation: number): Promise<Uint8Array> {
  const { doc, page } = await startPage();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.setRotation(degrees(rotation));
  page.drawText("Rental agreement", { x: 72, y: 740, size: 18, font });
  return doc.save();
}
