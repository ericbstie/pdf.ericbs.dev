import { expect, test } from "bun:test";
import { type Bitmap, findCheckboxes, toPagePoints } from "./detect";
import type { Rect } from "./edits";

const SIZE = { minPixels: 8, maxPixels: 40 };

function blankPage(width = 120, height = 120): Bitmap {
  return { width, height, luminance: new Uint8Array(width * height).fill(255) };
}

function paint(bitmap: Bitmap, x: number, y: number): void {
  bitmap.luminance[y * bitmap.width + x] = 0;
}

function fill(bitmap: Bitmap, area: Rect): void {
  for (let y = area.y; y < area.y + area.height; y += 1) {
    for (let x = area.x; x < area.x + area.width; x += 1) paint(bitmap, x, y);
  }
}

function outline(bitmap: Bitmap, box: Rect): void {
  fill(bitmap, { ...box, height: 1 });
  fill(bitmap, { ...box, y: box.y + box.height - 1, height: 1 });
  fill(bitmap, { ...box, width: 1 });
  fill(bitmap, { ...box, x: box.x + box.width - 1, width: 1 });
}

const box = (x: number, y: number, side = 14): Rect => ({ x, y, width: side, height: side });

test("finds an empty printed box", () => {
  const page = blankPage();
  outline(page, box(20, 30));
  expect(findCheckboxes(page, SIZE)).toEqual([box(20, 30)]);
});

test("finds every box on the page", () => {
  const page = blankPage();
  outline(page, box(20, 20));
  outline(page, box(20, 60));
  outline(page, box(60, 20));
  expect(findCheckboxes(page, SIZE)).toHaveLength(3);
});

test("ignores a solid square", () => {
  const page = blankPage();
  fill(page, box(20, 30));
  expect(findCheckboxes(page, SIZE)).toEqual([]);
});

test("ignores a box that is already ticked", () => {
  const page = blankPage();
  outline(page, box(20, 30));
  for (let step = 0; step < 9; step += 1) paint(page, 23 + step, 41 - step);
  expect(findCheckboxes(page, SIZE)).toEqual([]);
});

test("ignores a long rectangle", () => {
  const page = blankPage();
  outline(page, { x: 20, y: 30, width: 40, height: 12 });
  expect(findCheckboxes(page, SIZE)).toEqual([]);
});

test("ignores boxes outside the expected size range", () => {
  const page = blankPage(200, 200);
  outline(page, box(10, 10, 5));
  outline(page, box(40, 40, 90));
  expect(findCheckboxes(page, SIZE)).toEqual([]);
});

test("ignores letters and rules", () => {
  const page = blankPage();
  fill(page, { x: 10, y: 100, width: 100, height: 1 });
  fill(page, { x: 30, y: 20, width: 2, height: 11 });
  expect(findCheckboxes(page, SIZE)).toEqual([]);
});

test("toPagePoints converts pixels back to points", () => {
  expect(toPagePoints({ x: 20, y: 40, width: 14, height: 14 }, 2)).toEqual({ x: 10, y: 20, width: 7, height: 7 });
});
