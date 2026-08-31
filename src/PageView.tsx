import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useRef, useState } from "react";
import type { Box, Command, Marks, Point } from "./edits";
import type { OpenPdf, PageSize, RenderedPage } from "./pdf";
import { paintPage } from "./render";
import { keepEncodable } from "./text";
import type { Tool } from "./Toolbar";
import { boxAt, paintDensity, reachFor, toPagePoint } from "./viewport";

const PEN_WIDTH = 2;
const TEXT_SIZE = 14;

/** How far ahead of the viewport a page starts painting itself, as a share of the screen. */
const PAINT_AHEAD = "150%";

/** The finger or cursor a stroke belongs to, so a second one cannot join in halfway through. */
type Drawing = { pointerId: number; points: Point[] };

type Props = {
  pdf: OpenPdf;
  number: number;
  size: PageSize;
  scale: number;
  pixelRatio: number;
  /** The box the pages scroll inside, which decides when a page is close enough to be worth painting. */
  within: RefObject<Element | null>;
  marks: Marks;
  tool: Tool;
  onCommand: (command: Command) => void;
};

function withDraft(marks: Marks, drawing: Drawing | null, page: number): Marks {
  if (!drawing) return marks;
  return { ...marks, strokes: [...marks.strokes, { page, points: drawing.points, width: PEN_WIDTH }] };
}

function cursorFor(tool: Tool, overBox: boolean): string {
  if (tool === "draw") return "cursor-crosshair";
  if (tool === "text") return "cursor-text";
  return overBox ? "cursor-pointer" : "cursor-default";
}

/** With the pen out, one finger draws instead of scrolling — but two still pan and zoom the page. */
function touchActionFor(tool: Tool): string {
  return tool === "draw" ? "touch-pinch-zoom" : "touch-auto";
}

/**
 * True once the element has come within reach of the scrolling box, and true from then on.
 * The box has to be named: a margin only ever widens the observer's own root, so an element
 * clipped away by some scroller in between is out of sight however generous the margin is.
 */
function useApproached(ref: RefObject<Element | null>, within: RefObject<Element | null>, margin: string): boolean {
  const [approached, setApproached] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || approached) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) setApproached(true);
      },
      { root: within.current, rootMargin: margin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, within, margin, approached]);
  return approached;
}

/** Mobile Safari zooms the whole page in on any field smaller than this, and never zooms back out. */
const NO_ZOOM_SIZE = 16;

type WritingFieldProps = {
  at: Point;
  scale: number;
  size: number;
  value: string;
  onChange: (words: string) => void;
  onCommit: () => void;
  onCancel: () => void;
};

/** A caret sitting on the page itself, so what you type is where it will print. */
function WritingField({ at, scale, size, value, onChange, onCommit, onCancel }: WritingFieldProps) {
  const drawn = size * scale;
  const typed = Math.max(drawn, NO_ZOOM_SIZE);
  return (
    <input
      data-testid="text-input"
      aria-label="Write"
      autoFocus
      enterKeyHint="done"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      value={value}
      onChange={event => onChange(keepEncodable(event.target.value))}
      onKeyDown={event => {
        if (event.key === "Enter") onCommit();
        if (event.key === "Escape") onCancel();
      }}
      onBlur={onCommit}
      style={{
        left: at.x * scale,
        top: (at.y - size * 0.5) * scale,
        fontSize: typed,
        lineHeight: `${typed}px`,
        height: typed,
        width: `${Math.max(1, value.length)}ch`,
        // Typed at a size the phone will not zoom into, then shrunk to the size it will print at.
        transform: `scale(${drawn / typed})`,
        transformOrigin: "top left",
        fontFamily: "Helvetica, Arial, sans-serif",
      }}
      className="absolute bg-transparent p-0 text-neutral-900 caret-neutral-900 outline-none"
    />
  );
}

export function PageView({ pdf, number, size, scale, pixelRatio, within, marks, tool, onCommand }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState<RenderedPage | null>(null);
  const [unpaintable, setUnpaintable] = useState(false);
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [hovered, setHovered] = useState<Box | undefined>(undefined);
  const [writingAt, setWritingAt] = useState<Point | null>(null);
  const [words, setWords] = useState("");
  const approached = useApproached(sheetRef, within, PAINT_AHEAD);
  const density = paintDensity(scale, pixelRatio, size);

  useEffect(() => {
    if (!approached) return;
    let live = true;
    setUnpaintable(false);
    pdf.render(number, density).then(
      page => {
        if (live) setRendered(page);
      },
      () => {
        if (live) setUnpaintable(true);
      },
    );
    return () => {
      live = false;
    };
  }, [pdf, number, density, approached]);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context || !rendered) return;
    paintPage(context, { image: rendered.image, pixelsPerPoint: density, marks: withDraft(marks, drawing, number), hovered });
  }, [rendered, marks, drawing, hovered, density, number]);

  useEffect(() => setHovered(undefined), [tool]);

  const pointOf = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return toPagePoint({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, scale);
  };

  const abandonWriting = (): void => {
    setWritingAt(null);
    setWords("");
  };

  const finishWriting = (): void => {
    if (writingAt && words.trim() !== "") {
      onCommand({ kind: "write", writing: { page: number, at: writingAt, text: words, size: TEXT_SIZE } });
    }
    abandonWriting();
  };

  const startMark = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (drawing) return;
    const at = pointOf(event);
    if (tool === "draw") {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrawing({ pointerId: event.pointerId, points: [at] });
      return;
    }
    if (tool === "text") {
      event.preventDefault();
      finishWriting();
      setWritingAt(at);
      return;
    }
    const box = boxAt(rendered?.boxes ?? [], at, reachFor(event.pointerType));
    if (box) onCommand({ kind: "toggle", box });
  };

  const trackPointer = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const at = pointOf(event);
    if (drawing) {
      if (event.pointerId !== drawing.pointerId) return;
      setDrawing(current => (current ? { ...current, points: [...current.points, at] } : current));
      return;
    }
    if (tool === null && event.pointerType === "mouse") {
      setHovered(boxAt(rendered?.boxes ?? [], at, reachFor(event.pointerType)));
    }
  };

  const finishStroke = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!drawing || event.pointerId !== drawing.pointerId) return;
    onCommand({ kind: "draw", stroke: { page: number, points: drawing.points, width: PEN_WIDTH } });
    setDrawing(null);
  };

  /** A gesture the browser takes over — a system swipe, a call arriving — leaves no ink behind. */
  const dropStroke = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (drawing && event.pointerId === drawing.pointerId) setDrawing(null);
  };

  return (
    <div
      ref={sheetRef}
      className="relative bg-white shadow-2xl"
      style={{ width: size.width * scale, height: size.height * scale }}
    >
      {approached && !unpaintable && (
        <canvas
          ref={canvasRef}
          data-page={number}
          width={Math.ceil(size.width * density)}
          height={Math.ceil(size.height * density)}
          style={{ width: size.width * scale, height: size.height * scale }}
          className={`block ${touchActionFor(tool)} ${cursorFor(tool, hovered !== undefined)}`}
          onPointerDown={startMark}
          onPointerMove={trackPointer}
          onPointerUp={finishStroke}
          onPointerCancel={dropStroke}
          onPointerLeave={() => setHovered(undefined)}
        />
      )}
      {unpaintable && (
        <p className="grid h-full place-items-center p-6 text-center text-sm text-neutral-500">
          This page could not be drawn.
        </p>
      )}
      {writingAt && (
        <WritingField
          at={writingAt}
          scale={scale}
          size={TEXT_SIZE}
          value={words}
          onChange={setWords}
          onCommit={finishWriting}
          onCancel={abandonWriting}
        />
      )}
    </div>
  );
}
