import { expect, test } from "bun:test";
import type { Box } from "./edits";
import { boxAt, fitScale, toPagePoint } from "./viewport";

const box: Box = { page: 1, id: "a", rect: { x: 100, y: 200, width: 14, height: 14 } };

test("a narrow window shrinks the page to fit", () => {
  expect(fitScale(400, 612)).toBeCloseTo((400 - 48) / 612, 5);
});

test("a wide window stops enlarging the page", () => {
  expect(fitScale(4000, 612)).toBe(1.5);
});

test("toPagePoint undoes the display scale", () => {
  expect(toPagePoint({ x: 150, y: 300 }, 1.5)).toEqual({ x: 100, y: 200 });
});

test("a click inside the box hits it", () => {
  expect(boxAt([box], { x: 107, y: 207 })).toBe(box);
});

test("a click just outside still hits it", () => {
  expect(boxAt([box], { x: 99, y: 199 })).toBe(box);
});

test("a click well clear of the box hits nothing", () => {
  expect(boxAt([box], { x: 140, y: 207 })).toBeUndefined();
});
