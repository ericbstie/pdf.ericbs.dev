import { describe, expect, test } from "bun:test";
import { type Box, type Command, type Writing, marksFrom, marksOnPage, withoutLast } from "./edits";

/** Boxes are told apart by where they sit, so each one gets a place of its own. */
const box = (at: number): Box => ({ page: 1, rect: { x: at * 40, y: 0, width: 10, height: 10 } });
const toggle = (at: number): Command => ({ kind: "toggle", box: box(at) });
const draw: Command = { kind: "draw", stroke: { page: 1, points: [{ x: 0, y: 0 }], width: 2 } };
const writing = (id: string, at = { x: 5, y: 5 }, text = "hi"): Writing => ({ id, page: 1, at, text, size: 14 });
const write: Command = { kind: "write", writing: writing("one") };

describe("marksFrom", () => {
  test("keeps strokes and writings in the order they were made", () => {
    const marks = marksFrom([draw, write, draw]);
    expect(marks.strokes).toHaveLength(2);
    expect(marks.writings).toHaveLength(1);
  });

  test("a single toggle ticks the box", () => {
    expect(marksFrom([toggle(1)]).ticks).toEqual([box(1)]);
  });

  test("a second toggle unticks it", () => {
    expect(marksFrom([toggle(1), toggle(1)]).ticks).toEqual([]);
  });

  test("toggling one box leaves the others ticked", () => {
    expect(marksFrom([toggle(1), toggle(2), toggle(1)]).ticks).toEqual([box(2)]);
  });

  test("a box found a hair off where it was last time is the same box", () => {
    // Far enough off that rounding the corner to whole points would call it a different box.
    const shifted: Command = { kind: "toggle", box: { page: 1, rect: { x: 40.6, y: 0.7, width: 10, height: 10 } } };
    expect(marksFrom([toggle(1), shifted]).ticks).toEqual([]);
  });

  test("the same place on another page is another box", () => {
    const overleaf: Command = { kind: "toggle", box: { page: 2, rect: { x: 40, y: 0, width: 10, height: 10 } } };
    expect(marksFrom([toggle(1), overleaf]).ticks).toHaveLength(2);
  });

  test("a revision takes the place of the writing it names", () => {
    const moved: Command = { kind: "revise", writing: writing("one", { x: 90, y: 90 }, "hello") };
    expect(marksFrom([write, moved]).writings).toEqual([writing("one", { x: 90, y: 90 }, "hello")]);
  });

  test("a revised writing stays where it was in the order, so nothing jumps in front of it", () => {
    const second: Command = { kind: "write", writing: writing("two") };
    const moved: Command = { kind: "revise", writing: writing("one", { x: 90, y: 90 }) };
    expect(marksFrom([write, second, moved]).writings.map(one => one.id)).toEqual(["one", "two"]);
  });

  test("an erasure takes the writing away and leaves the others", () => {
    const second: Command = { kind: "write", writing: writing("two") };
    expect(marksFrom([write, second, { kind: "erase", id: "one" }]).writings.map(one => one.id)).toEqual(["two"]);
  });

  test("erasing something that is no longer there does nothing", () => {
    expect(marksFrom([write, { kind: "erase", id: "gone" }]).writings).toHaveLength(1);
  });

  test("a revision cannot bring back a writing that was erased before it", () => {
    const commands: Command[] = [write, { kind: "erase", id: "one" }, { kind: "revise", writing: writing("one") }];
    expect(marksFrom(commands).writings).toEqual([]);
  });

  test("a form field answers to its name, wherever it is drawn", () => {
    const named = (rect: { x: number; y: number; width: number; height: number }): Command => ({
      kind: "toggle",
      box: { page: 1, field: "agree", rect },
    });
    expect(marksFrom([named({ x: 0, y: 0, width: 10, height: 10 }), named({ x: 500, y: 500, width: 10, height: 10 })]).ticks).toEqual([]);
  });
});

test("withoutLast undoes the most recent command", () => {
  expect(marksFrom(withoutLast([draw, toggle(1)])).ticks).toEqual([]);
  expect(marksFrom(withoutLast([draw, toggle(1)])).strokes).toHaveLength(1);
});

test("undoing a move puts the writing back where it was", () => {
  const moved: Command = { kind: "revise", writing: writing("one", { x: 90, y: 90 }) };
  expect(marksFrom(withoutLast([write, moved])).writings).toEqual([writing("one")]);
});

test("undoing an erasure brings the writing back", () => {
  const commands: Command[] = [write, { kind: "erase", id: "one" }];
  expect(marksFrom(withoutLast(commands)).writings).toEqual([writing("one")]);
});

test("marksOnPage keeps only what belongs to that page", () => {
  const marks = marksFrom([
    draw,
    { kind: "draw", stroke: { page: 2, points: [{ x: 0, y: 0 }], width: 2 } },
    toggle(1),
  ]);
  expect(marksOnPage(marks, 2).strokes).toHaveLength(1);
  expect(marksOnPage(marks, 2).ticks).toEqual([]);
  expect(marksOnPage(marks, 1).ticks).toHaveLength(1);
});
