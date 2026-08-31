import { describe, expect, test } from "bun:test";
import type { Writing } from "./edits";
import { writingAt, writingRect } from "./writing";

const writing = (id: string, at: { x: number; y: number }, text = "Paid in full"): Writing => ({
  id,
  page: 1,
  at,
  text,
  size: 14,
});

/** Stands in for measuring: near enough to Helvetica to place a box, and it never varies. */
const measured = (one: Writing) => writingRect(one, one.text.length * one.size * 0.5);

describe("writingRect", () => {
  test("hangs the box either side of the point the letters are drawn from", () => {
    const rect = writingRect(writing("one", { x: 100, y: 200 }), 60);
    expect(rect).toEqual({ x: 100, y: 193, width: 60, height: 14 });
  });

  test("a writing too narrow to take hold of is given something to take hold of", () => {
    expect(writingRect(writing("one", { x: 0, y: 0 }, "."), 3).width).toBe(7);
  });
});

describe("writingAt", () => {
  const here = writing("one", { x: 100, y: 200 });

  test("finds the writing under the point", () => {
    expect(writingAt([here], measured, { x: 120, y: 200 }, 0)?.id).toBe("one");
  });

  test("finds nothing beside it", () => {
    expect(writingAt([here], measured, { x: 500, y: 200 }, 0)).toBeUndefined();
  });

  test("a fingertip landing just outside still counts", () => {
    expect(writingAt([here], measured, { x: 96, y: 200 }, 8)?.id).toBe("one");
    expect(writingAt([here], measured, { x: 96, y: 200 }, 2)).toBeUndefined();
  });

  test("where two overlap it takes the one on top, which is the last one written", () => {
    const over = writing("two", { x: 110, y: 200 });
    expect(writingAt([here, over], measured, { x: 120, y: 200 }, 0)?.id).toBe("two");
  });
});
