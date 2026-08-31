import { overlaps } from "./viewport";

/** Marks live in page space: points measured from the page's top-left corner, y downward. */
export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

export type Stroke = { page: number; points: readonly Point[]; width: number };

/** `id` is the name a later command calls it by, to move it, reword it, or take it away. */
export type Writing = { id: string; page: number; at: Point; text: string; size: number };

/** A checkbox found on a page. `field` names the AcroForm field behind it, when there is one. */
export type Box = { page: number; rect: Rect; field?: string };

export type Command =
  | { kind: "draw"; stroke: Stroke }
  | { kind: "write"; writing: Writing }
  | { kind: "revise"; writing: Writing }
  | { kind: "erase"; id: string }
  | { kind: "toggle"; box: Box };

export type Marks = {
  strokes: readonly Stroke[];
  writings: readonly Writing[];
  ticks: readonly Box[];
};

/** Enough to tell one of anything from the next. `randomUUID` is absent outside a secure context. */
export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Two sightings of the same box. A form field answers to its name; a printed square is only ever
 * a place on the page, and it is recognised by being in that place — detection can shift it by a
 * fraction of a point between one painting and the next, and no two checkboxes share a spot.
 */
function sameBox(one: Box, other: Box): boolean {
  if (one.page !== other.page) return false;
  if (one.field !== undefined || other.field !== undefined) return one.field === other.field;
  return overlaps(one.rect, other.rect);
}

function foldToggles(toggles: readonly Box[]): Box[] {
  const ticked: Box[] = [];
  for (const box of toggles) {
    const already = ticked.findIndex(other => sameBox(other, box));
    if (already < 0) ticked.push(box);
    else ticked.splice(already, 1);
  }
  return ticked;
}

/**
 * The writings as they stand after every revision: one for each id, in the order they were first
 * written, since a map keeps a key where it first put it. A revision only reaches a writing that
 * is still there, so undoing back past an erasure cannot bring one back by a later revision.
 */
function foldWritings(commands: readonly Command[]): Writing[] {
  const kept = new Map<string, Writing>();
  for (const command of commands) {
    if (command.kind === "write") kept.set(command.writing.id, command.writing);
    if (command.kind === "revise" && kept.has(command.writing.id)) kept.set(command.writing.id, command.writing);
    if (command.kind === "erase") kept.delete(command.id);
  }
  return [...kept.values()];
}

export function marksFrom(commands: readonly Command[]): Marks {
  return {
    strokes: commands.flatMap(command => (command.kind === "draw" ? [command.stroke] : [])),
    writings: foldWritings(commands),
    ticks: foldToggles(commands.flatMap(command => (command.kind === "toggle" ? [command.box] : []))),
  };
}

export function marksOnPage(marks: Marks, pageNumber: number): Marks {
  const here = <Mark extends { page: number }>(items: readonly Mark[]) => items.filter(item => item.page === pageNumber);
  return { strokes: here(marks.strokes), writings: here(marks.writings), ticks: here(marks.ticks) };
}

export function withoutLast(commands: readonly Command[]): Command[] {
  return commands.slice(0, -1);
}
