import { expect, test } from "bun:test";
import { ZOOM, atScale, clampZoom, cornerFor, heldAt, midpointOf, spreadOf, wheelFactor } from "./zoom";

test("zoom stays within what the pages are worth reading at", () => {
  expect(clampZoom(100)).toBe(ZOOM.most);
  expect(clampZoom(0.01)).toBe(ZOOM.least);
  expect(clampZoom(2)).toBe(2);
});

test("wheeling up zooms in and wheeling down zooms out", () => {
  expect(wheelFactor({ deltaY: -100, deltaMode: 0 })).toBeGreaterThan(1);
  expect(wheelFactor({ deltaY: 100, deltaMode: 0 })).toBeLessThan(1);
});

test("a notch back the other way undoes the notch before it", () => {
  const inwards = wheelFactor({ deltaY: -60, deltaMode: 0 });
  const outwards = wheelFactor({ deltaY: 60, deltaMode: 0 });
  expect(inwards * outwards).toBeCloseTo(1, 10);
});

test("a wheel counting in lines moves further than one counting in pixels", () => {
  expect(wheelFactor({ deltaY: -3, deltaMode: 1 })).toBeGreaterThan(wheelFactor({ deltaY: -3, deltaMode: 0 }));
});

test("one enormous wheel event still lands softly", () => {
  expect(wheelFactor({ deltaY: -100_000, deltaMode: 2 })).toBeLessThan(1.6);
});

test("a touchpad's small nudges zoom smoothly rather than jumping", () => {
  expect(wheelFactor({ deltaY: -2, deltaMode: 0 })).toBeLessThan(1.02);
  expect(wheelFactor({ deltaY: -2, deltaMode: 0 })).toBeGreaterThan(1);
});

test("the fingers are read as how far apart they are and what they are around", () => {
  const one = { clientX: 100, clientY: 200 };
  const other = { clientX: 130, clientY: 240 };
  expect(spreadOf(one, other)).toBe(50);
  expect(midpointOf(one, other)).toEqual({ x: 115, y: 220 });
});

test("what the fingers are over is read off the pages as they are drawn", () => {
  expect(heldAt({ x: 100, y: 50 }, { x: 400, y: 350 }, 2)).toEqual({ x: 150, y: 150 });
});

test("the pages back away from the fingers in proportion", () => {
  const held = heldAt({ x: 0, y: 0 }, { x: 100, y: 50 }, 1);
  expect(cornerFor({ x: 100, y: 50 }, held, 2)).toEqual({ x: -100, y: -50 });
});

test("a point already in the corner keeps the corner where it is", () => {
  const held = heldAt({ x: 40, y: 60 }, { x: 40, y: 60 }, 1);
  expect(cornerFor({ x: 40, y: 60 }, held, 3)).toEqual({ x: 40, y: 60 });
});

test("the corner is aimed at from the size the pages are, not from where they last were", () => {
  const corner = { x: -240, y: -80 };
  const focus = { x: 300, y: 400 };
  const held = heldAt(corner, focus, 1.5);
  // Whatever happened at the sizes in between, the size it lands at is the one that decides.
  expect(cornerFor(focus, held, 3.75)).toEqual(cornerFor(focus, heldAt(cornerFor(focus, held, 2), focus, 2), 3.75));
  expect(cornerFor(focus, held, 1.5)).toEqual(corner);
});

test("a length on the page is written so the browser scales it with them", () => {
  expect(atScale(612)).toBe("calc(var(--scale, 1) * 612px)");
});
