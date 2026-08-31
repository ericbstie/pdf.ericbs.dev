import { expect, test } from "bun:test";
import { ZOOM, anchorFor, clampZoom, midpointOf, spreadOf, wheelFactor } from "./zoom";

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

test("the pages back away from the fingers in proportion", () => {
  expect(anchorFor({ x: 0, y: 0 }, { x: 100, y: 50 }, 2)).toEqual({ x: -100, y: -50 });
});

test("a point already in the corner keeps the corner where it is", () => {
  expect(anchorFor({ x: 40, y: 60 }, { x: 40, y: 60 }, 3)).toEqual({ x: 40, y: 60 });
});

test("zooming back out puts the corner back where it started", () => {
  const corner = { x: -240, y: -80 };
  const focus = { x: 300, y: 400 };
  const inwards = anchorFor(corner, focus, 2.5);
  expect(anchorFor(inwards, focus, 1 / 2.5)).toEqual(corner);
});
