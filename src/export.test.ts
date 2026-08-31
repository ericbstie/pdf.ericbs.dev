import { expect, test } from "bun:test";
import { FLAT_BOXES, FORM_BOXES, PAGE_SIZE, buildFlatCheckboxPdf, buildFormCheckboxPdf, buildPlainPdf, buildRotatedPdf } from "../tests/fixtures";
import { countPaintOps, readCheckboxStates, readPathCorners, readTextPlacements, toViewPoint } from "../tests/verify";
import type { Box, Marks } from "./edits";
import { exportPdf } from "./export";

const nothing: Marks = { strokes: [], writings: [], ticks: [] };

/** Fixture rects are in PDF space; marks are in page space, so flip the y axis. */
function asPageBox(rect: (typeof FLAT_BOXES)[number], id: string, field?: string): Box {
  return { page: 1, id, field, rect: { ...rect, y: PAGE_SIZE.height - rect.y - rect.height } };
}

test("writing lands where it was placed", async () => {
  const saved = await exportPdf(await buildPlainPdf(), {
    ...nothing,
    writings: [{ page: 1, at: { x: 200, y: 492 }, text: "Paid in full", size: 14 }],
  });
  const written = (await readTextPlacements(saved)).find(item => item.text === "Paid in full");
  expect(written).toBeDefined();
  expect(written!.x).toBeCloseTo(200, 1);
  expect(written!.y).toBeCloseTo(300 - 14 * 0.358, 1);
});

test("the original content survives", async () => {
  const saved = await exportPdf(await buildPlainPdf(), nothing);
  expect((await readTextPlacements(saved)).map(item => item.text)).toContain("Rental agreement");
});

test("a ticked form checkbox becomes a field value", async () => {
  const saved = await exportPdf(await buildFormCheckboxPdf(), {
    ...nothing,
    ticks: [asPageBox(FORM_BOXES[0]!, "agree", "agree")],
  });
  expect(await readCheckboxStates(saved)).toEqual(new Map([["agree", true], ["subscribe", false]]));
});

test("a printed checkbox gets a stroked tick stamped over it", async () => {
  const source = await buildFlatCheckboxPdf();
  const saved = await exportPdf(source, { ...nothing, ticks: [asPageBox(FLAT_BOXES[0]!, "0")] });
  const before = await countPaintOps(source);
  const after = await countPaintOps(saved);
  expect(after.stroked).toBe(before.stroked + 1);
  expect(after.filled).toBe(before.filled);
});

test("a drawn stroke is stroked, not filled", async () => {
  const source = await buildPlainPdf();
  const saved = await exportPdf(source, {
    ...nothing,
    strokes: [{ page: 1, points: [{ x: 10, y: 10 }, { x: 90, y: 40 }], width: 2 }],
  });
  const before = await countPaintOps(source);
  const after = await countPaintOps(saved);
  expect(after.stroked).toBe(before.stroked + 1);
  expect(after.filled).toBe(before.filled);
});

test("marks aimed past the last page are dropped", async () => {
  const saved = await exportPdf(await buildPlainPdf(), {
    ...nothing,
    strokes: [{ page: 7, points: [{ x: 0, y: 0 }], width: 2 }],
  });
  expect(saved.length).toBeGreaterThan(0);
});

for (const rotation of [0, 90, 180, 270]) {
  test(`writing lands where it was placed on a page turned ${rotation} degrees`, async () => {
    const at = { x: 120, y: 200 };
    const saved = await exportPdf(await buildRotatedPdf(rotation), {
      ...nothing,
      writings: [{ page: 1, at, text: "Paid in full", size: 14 }],
    });
    const written = (await readTextPlacements(saved)).find(item => item.text === "Paid in full");
    expect(written).toBeDefined();
    const onScreen = await toViewPoint(saved, written!);
    expect(onScreen.x).toBeCloseTo(at.x, 0);
    expect(onScreen.y).toBeCloseTo(at.y + 14 * 0.358, 0);
  });
}

for (const rotation of [0, 90, 180, 270]) {
  test(`ink lands where it was drawn on a page turned ${rotation} degrees`, async () => {
    const at = { x: 120, y: 200 };
    const saved = await exportPdf(await buildRotatedPdf(rotation), {
      ...nothing,
      strokes: [{ page: 1, points: [at], width: 3 }],
    });
    const [corner] = await readPathCorners(saved);
    expect(corner).toBeDefined();
    const onScreen = await toViewPoint(saved, corner!);
    expect(onScreen.x).toBeCloseTo(at.x, 3);
    expect(onScreen.y).toBeCloseTo(at.y, 3);
  });
}
