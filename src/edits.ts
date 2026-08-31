import { overlaps } from "./viewport";

/** Marks live in page space: points measured from the page's top-left corner, y downward. */
export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

export type Stroke = { page: number; points: readonly Point[]; width: number };
export type Writing = { page: number; at: Point; text: string; size: number };

/** A checkbox found on a page. `field` names the AcroForm field behind it, when there is one. */
export type Box = { page: number; rect: Rect; field?: string };

export type Command =
  | { kind: "draw"; stroke: Stroke }
  | { kind: "write"; writing: Writing }
  | { kind: "toggle"; box: Box };

export type Marks = {
  strokes: readonly Stroke[];
  writings: readonly Writing[];
  ticks: readonly Box[];
};

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

export function marksFrom(commands: readonly Command[]): Marks {
  return {
    strokes: commands.flatMap(command => (command.kind === "draw" ? [command.stroke] : [])),
    writings: commands.flatMap(command => (command.kind === "write" ? [command.writing] : [])),
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
