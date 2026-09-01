import { expect, test } from "bun:test";
import type { Box } from "./edits";
import {
  boxAt,
  fitScale,
  ontoPage,
  overlaps,
  shifted,
  paintDensity,
  reachFor,
  stillFits,
  toPagePoint,
  visiblePart,
  wholePageIsSharp,
  widestPage,
  withBand,
} from "./viewport";

const box: Box = { page: 1, rect: { x: 100, y: 200, width: 14, height: 14 } };
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
  expect(fitScale(1280, widestPage([]))).toBe(1);
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

test("a page read at its own size fits in one canvas, and zoomed in far enough it does not", () => {
  expect(wholePageIsSharp(1.5, 2, LETTER)).toBe(true);
  expect(wholePageIsSharp(6, 2, LETTER)).toBe(false);
});

test("the part on screen is painted as sharply as the whole page could not be", () => {
  const part = { width: 200, height: 300 };
  expect(paintDensity(6, 2, part)).toBeGreaterThan(paintDensity(6, 2, LETTER));
});

const WINDOW = { left: 0, top: 0, width: 800, height: 600 };

test("a page hanging off the bottom of the window is visible as far as the window goes", () => {
  const sheet = { left: 100, top: -200, width: 600, height: 1200 };
  expect(visiblePart(sheet, WINDOW, 2)).toEqual({ x: 0, y: 100, width: 300, height: 300 });
});

test("a page scrolled clean past has no part on screen", () => {
  expect(visiblePart({ left: 0, top: -900, width: 600, height: 800 }, WINDOW, 1)).toBeNull();
});

test("the part painted reaches past the screen, but never past the page", () => {
  const banded = withBand({ x: 0, y: 300, width: 300, height: 300 }, LETTER);
  expect(banded.x).toBe(0);
  expect(banded.y).toBeLessThan(300);
  expect(banded.width).toBeGreaterThan(300);
  expect(banded.x + banded.width).toBeLessThanOrEqual(LETTER.width);
});

test("a painted part holds through a nudge and gives way to a scroll", () => {
  const part = withBand({ x: 100, y: 100, width: 200, height: 200 }, LETTER);
  expect(stillFits(part, { x: 110, y: 110, width: 200, height: 200 })).toBe(true);
  expect(stillFits(part, { x: 100, y: 400, width: 200, height: 200 })).toBe(false);
});

test("a painted part far larger than the screen is painted smaller instead", () => {
  const wholePage = { x: 0, y: 0, ...LETTER };
  expect(stillFits(wholePage, { x: 0, y: 0, width: 100, height: 100 })).toBe(false);
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

test("shifted takes a rectangle without resizing it", () => {
  expect(shifted({ x: 10, y: 20, width: 30, height: 40 }, { x: -5, y: 5 })).toEqual({ x: 5, y: 25, width: 30, height: 40 });
});

test("a mark may be carried anywhere its own part of it stays on the paper", () => {
  const mark = { x: 100, y: 100, width: 50, height: 20 };
  expect(ontoPage({ x: 40, y: 40 }, mark, LETTER)).toEqual({ x: 40, y: 40 });
});

test("a mark carried off the top-left corner is stopped at it", () => {
  const mark = { x: 100, y: 100, width: 50, height: 20 };
  expect(ontoPage({ x: -400, y: -400 }, mark, LETTER)).toEqual({ x: -100, y: -100 });
});

test("a mark carried off the far edge is stopped with the whole of it on the page", () => {
  const mark = { x: 100, y: 100, width: 50, height: 20 };
  expect(ontoPage({ x: 900, y: 900 }, mark, LETTER)).toEqual({ x: 462, y: 672 });
});

test("a mark too big for the page keeps its own corner on it", () => {
  const wider = { x: 0, y: 0, width: 900, height: 20 };
  expect(ontoPage({ x: 300, y: 0 }, wider, LETTER).x).toBeCloseTo(0, 10);
});
