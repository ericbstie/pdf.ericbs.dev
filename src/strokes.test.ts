import { describe, expect, test } from "bun:test";
import type { Stroke } from "./edits";
import { fromStroke, movedStroke, strokeAt, strokeRect } from "./strokes";

const line = (id: string, points: { x: number; y: number }[], width = 2): Stroke => ({ id, page: 1, points, width });

/** More points than an engine will spread into a call, so a walk is the only way through them. */
const LONG_DRAG = 1_000_000;

const across: Stroke = line("across", [
  { x: 100, y: 100 },
  { x: 300, y: 100 },
]);

const corner: Stroke = line("corner", [
  { x: 0, y: 0 },
  { x: 200, y: 200 },
]);

describe("strokeRect", () => {
  test("holds the ink and the width the pen laid it down at", () => {
    expect(strokeRect(line("wide", [{ x: 100, y: 100 }, { x: 300, y: 140 }], 10))).toEqual({
      x: 95,
      y: 95,
      width: 210,
      height: 50,
    });
  });

  test("a drag long enough to outrun an engine's arguments is still measured", () => {
    // One point per report of the pointer, which a hand holding a drag long enough runs up.
    // Spread into Math.min, this many is past what an engine will take as arguments — and the
    // count that breaks one is not the count that breaks another, so it is walked instead.
    const points = Array.from({ length: LONG_DRAG }, (_, step) => ({ x: step % 500, y: 100 }));
    const long = strokeRect(line("long", points));
    expect(long.x).toBe(-3);
    expect(long.width).toBe(505);
  });

  test("a tap with the pen is still given a box to take hold of", () => {
    const dot = strokeRect(line("dot", [{ x: 50, y: 50 }]));
    expect(dot.width).toBe(6);
    expect(dot.height).toBe(6);
  });
});

describe("fromStroke", () => {
  test("a stroke of a great many points is still measured", () => {
    const points = Array.from({ length: LONG_DRAG }, (_, step) => ({ x: step % 500, y: 100 }));
    expect(fromStroke(line("long", points), { x: 250, y: 110 })).toBe(10);
  });

  test("is nothing on the line itself", () => {
    expect(fromStroke(across, { x: 200, y: 100 })).toBe(0);
  });

  test("is measured from the nearest point of the line, not from its ends", () => {
    expect(fromStroke(across, { x: 200, y: 110 })).toBe(10);
  });

  test("stops at the ends rather than running on", () => {
    expect(fromStroke(across, { x: 320, y: 100 })).toBe(20);
  });
});

describe("strokeAt", () => {
  test("finds the line under the point", () => {
    expect(strokeAt([across], { x: 200, y: 100 }, 0)?.id).toBe("across");
  });

  test("finds nothing on the paper beside it", () => {
    expect(strokeAt([across], { x: 200, y: 160 }, 0)).toBeUndefined();
  });

  test("leaves the paper inside a diagonal's box alone", () => {
    // Well inside the box around the line, and nowhere near the ink.
    expect(strokeAt([corner], { x: 190, y: 10 }, 8)).toBeUndefined();
    expect(strokeAt([corner], { x: 100, y: 100 }, 0)?.id).toBe("corner");
  });

  test("a fingertip is allowed to land beside the line", () => {
    expect(strokeAt([across], { x: 200, y: 108 }, 8)?.id).toBe("across");
  });

  test("where two lines cross, the last one drawn is the one found", () => {
    expect(strokeAt([across, corner], { x: 100, y: 100 }, 0)?.id).toBe("corner");
  });
});

test("movedStroke takes every point the same distance", () => {
  expect(movedStroke(across, { x: 10, y: -20 }).points).toEqual([
    { x: 110, y: 80 },
    { x: 310, y: 80 },
  ]);
});
