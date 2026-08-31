import { describe, expect, test } from "bun:test";
import { type Box, type Command, isTicked, marksFrom, withoutLast } from "./edits";

const box = (id: string): Box => ({ page: 1, id, rect: { x: 0, y: 0, width: 10, height: 10 } });
const toggle = (id: string): Command => ({ kind: "toggle", box: box(id) });
const draw: Command = { kind: "draw", stroke: { page: 1, points: [{ x: 0, y: 0 }], width: 2 } };
const write: Command = { kind: "write", writing: { page: 1, at: { x: 5, y: 5 }, text: "hi", size: 14 } };

describe("marksFrom", () => {
  test("keeps strokes and writings in the order they were made", () => {
    const marks = marksFrom([draw, write, draw]);
    expect(marks.strokes).toHaveLength(2);
    expect(marks.writings).toHaveLength(1);
  });

  test("a single toggle ticks the box", () => {
    expect(isTicked(marksFrom([toggle("a")]), "a")).toBe(true);
  });

  test("a second toggle unticks it", () => {
    expect(marksFrom([toggle("a"), toggle("a")]).ticks).toEqual([]);
  });

  test("toggling one box leaves the others ticked", () => {
    const marks = marksFrom([toggle("a"), toggle("b"), toggle("a")]);
    expect(marks.ticks.map(ticked => ticked.id)).toEqual(["b"]);
  });
});

test("withoutLast undoes the most recent command", () => {
  expect(marksFrom(withoutLast([draw, toggle("a")])).ticks).toEqual([]);
  expect(marksFrom(withoutLast([draw, toggle("a")])).strokes).toHaveLength(1);
});
