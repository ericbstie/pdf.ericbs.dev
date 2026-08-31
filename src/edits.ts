/** Marks live in page space: points measured from the page's top-left corner, y downward. */
export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

export type Stroke = { page: number; points: readonly Point[]; width: number };
export type Writing = { page: number; at: Point; text: string; size: number };

/** A checkbox found on a page. `field` names the AcroForm field behind it, when there is one. */
export type Box = { page: number; id: string; rect: Rect; field?: string };

export type Command =
  | { kind: "draw"; stroke: Stroke }
  | { kind: "write"; writing: Writing }
  | { kind: "toggle"; box: Box };

export type Marks = {
  strokes: readonly Stroke[];
  writings: readonly Writing[];
  ticks: readonly Box[];
};

function foldToggles(toggles: readonly Box[]): Box[] {
  const ticked = new Map<string, Box>();
  for (const box of toggles) {
    if (!ticked.delete(box.id)) ticked.set(box.id, box);
  }
  return [...ticked.values()];
}

export function marksFrom(commands: readonly Command[]): Marks {
  return {
    strokes: commands.flatMap(command => (command.kind === "draw" ? [command.stroke] : [])),
    writings: commands.flatMap(command => (command.kind === "write" ? [command.writing] : [])),
    ticks: foldToggles(commands.flatMap(command => (command.kind === "toggle" ? [command.box] : []))),
  };
}

export function isTicked(marks: Marks, boxId: string): boolean {
  return marks.ticks.some(box => box.id === boxId);
}

export function withoutLast(commands: readonly Command[]): Command[] {
  return commands.slice(0, -1);
}
