import { expect, test } from "bun:test";
import type { Box } from "./edits";
import { boxAt, fitScale, overlaps, paintDensity, reachFor, toPagePoint, widestPage } from "./viewport";

const box: Box = { page: 1, id: "a", rect: { x: 100, y: 200, width: 14, height: 14 } };
const LETTER = { width: 612, height: 792 };

test("a narrow window shrinks the page to fit", () => {
  expect(fitScale(400, 612)).toBeCloseTo((400 - 20) / 612, 5);
});

test("a wide window stops enlarging the page", () => {
  expect(fitScale(4000, 612)).toBe(1.5);
});

test("a phone spends its width on the page rather than on margins", () => {
  const onPhone = fitScale(390, 612) * 612;
  expect(390 - onPhone).toBeLessThan(24);
  expect(onPhone).toBeLessThan(390);
});

test("the widest page decides the scale", () => {
  expect(widestPage([{ width: 612 }, { width: 1008 }, { width: 612 }])).toBe(1008);
});

test("a file with no pages has no width to fit", () => {
  expect(widestPage([])).toBe(0);
});

test("a dense screen paints sharper than a plain one", () => {
  expect(paintDensity(1, 2, LETTER)).toBeGreaterThan(paintDensity(1, 1, LETTER));
});

test("a very dense screen stops asking for more pixels", () => {
  expect(paintDensity(1, 4, LETTER)).toBe(paintDensity(1, 2, LETTER));
});

test("an outsized page is painted coarsely enough to stay within canvas limits", () => {
  const poster = { width: 14400, height: 14400 };
  const density = paintDensity(1.5, 3, poster);
  expect(Math.round(poster.width * density * (poster.height * density))).toBeLessThanOrEqual(8_000_000);
  expect(Math.max(poster.width, poster.height) * density).toBeLessThan(4096);
});

test("an ordinary page on a sharp screen is not coarsened at all", () => {
  expect(paintDensity(1.5, 2, LETTER)).toBe(1.5 * 2);
});

test("toPagePoint undoes the display scale", () => {
  expect(toPagePoint({ x: 150, y: 300 }, 1.5)).toEqual({ x: 100, y: 200 });
});

test("a click inside the box hits it", () => {
  expect(boxAt([box], { x: 107, y: 207 }, reachFor("mouse"))).toBe(box);
});

test("a click just outside still hits it", () => {
  expect(boxAt([box], { x: 99, y: 199 }, reachFor("mouse"))).toBe(box);
});

test("a click well clear of the box hits nothing", () => {
  expect(boxAt([box], { x: 140, y: 207 }, reachFor("mouse"))).toBeUndefined();
});

test("a fingertip reaches a box a cursor would have missed", () => {
  const nearMiss = { x: 95, y: 195 };
  expect(boxAt([box], nearMiss, reachFor("mouse"))).toBeUndefined();
  expect(boxAt([box], nearMiss, reachFor("touch"))).toBe(box);
});

test("a fingertip still misses a box it is nowhere near", () => {
  expect(boxAt([box], { x: 140, y: 207 }, reachFor("touch"))).toBeUndefined();
});

test("overlapping rects are recognised", () => {
  expect(overlaps({ x: 0, y: 0, width: 10, height: 10 }, { x: 9, y: 9, width: 10, height: 10 })).toBe(true);
});

test("touching edges do not count as overlap", () => {
  expect(overlaps({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
});
