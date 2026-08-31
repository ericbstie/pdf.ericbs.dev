import { expect, test } from "bun:test";
import { checkPath, checkWidth, polylinePath } from "./paths";

test("polylinePath walks the points in order", () => {
  expect(polylinePath([{ x: 1, y: 2 }, { x: 3.456, y: 4 }])).toBe("M 1 2 L 3.46 4");
});

test("a lone point still paints a dot", () => {
  expect(polylinePath([{ x: 1, y: 2 }])).toBe("M 1 2 L 1 2");
});

test("no points, no path", () => {
  expect(polylinePath([])).toBe("");
});

test("the tick stays inside its box", () => {
  const box = { x: 100, y: 200, width: 14, height: 14 };
  const coordinates = checkPath(box).match(/[\d.]+/g)!.map(Number);
  const xs = coordinates.filter((_, index) => index % 2 === 0);
  const ys = coordinates.filter((_, index) => index % 2 === 1);
  expect(Math.min(...xs)).toBeGreaterThanOrEqual(box.x);
  expect(Math.max(...xs)).toBeLessThanOrEqual(box.x + box.width);
  expect(Math.min(...ys)).toBeGreaterThanOrEqual(box.y);
  expect(Math.max(...ys)).toBeLessThanOrEqual(box.y + box.height);
});

test("the tick thickens with the box", () => {
  expect(checkWidth({ x: 0, y: 0, width: 40, height: 40 })).toBeGreaterThan(checkWidth({ x: 0, y: 0, width: 14, height: 14 }));
});
