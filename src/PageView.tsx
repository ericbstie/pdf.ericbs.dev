import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Box, Command, Marks, Point, Rect } from "./edits";
import type { OpenPdf, PageSize, RenderedPage, RenderedPart } from "./pdf";
import { paintPage } from "./render";
import { keepEncodable } from "./text";
import type { Tool } from "./Toolbar";
import {
  boxAt,
  paintDensity,
  reachFor,
  stillFits,
  toPagePoint,
  visiblePart,
  wholePageIsSharp,
  withBand,
} from "./viewport";

const PEN_WIDTH = 2;
const TEXT_SIZE = 14;

/** How close a page comes before it is painted, and how much further it goes before it is let go. */
const PAINT_WITHIN = "150%";
const KEEP_WITHIN = "300%";

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

/**
 * With the pen out a finger draws rather than scrolling, so the browser is left nothing to do
 * with it. Either way two fingers are a pinch, which the editor answers itself.
 */
function touchActionFor(tool: Tool): string {
  return tool === "draw" ? "none" : "pan-x pan-y";
}

/**
 * Whether the page is close enough to the scrolling box to be worth a canvas. Two bands rather
 * than one, so a page painted on the way in is held until it is well clear and scrolling back and
 * forth across the edge does not repaint it each time.
 *
 * The box has to be named: a margin only ever widens the observer's own root, so an element
 * clipped away by some scroller in between is out of sight however generous the margin is.
 */
function useNearby(
  ref: RefObject<Element | null>,
  within: RefObject<Element | null>,
  paint: string,
  keep: string,
): boolean {
  const [nearby, setNearby] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const root = within.current;
    const arriving = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) setNearby(true);
      },
      { root, rootMargin: paint },
    );
    const leaving = new IntersectionObserver(
      entries => {
        if (entries.every(entry => !entry.isIntersecting)) setNearby(false);
      },
      { root, rootMargin: keep },
    );
    arriving.observe(element);
    leaving.observe(element);
    return () => {
      arriving.disconnect();
      leaving.disconnect();
    };
  }, [ref, within, paint, keep]);
  return nearby;
}

/** How long a zoom has to hold still before the pages are painted again at the size it asks for. */
const SETTLE = 150;

/**
 * Follows a value once it has stopped moving. A pinch changes the scale with every touch it
 * reports, and each repainting is a whole page through the reader: between them the canvas
 * already in hand is stretched, which is what the browser's own zoom would have done throughout.
 */
function useSettled<Value>(value: Value, ms: number): Value {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (value === settled) return;
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, settled, ms]);
  return settled;
}

/**
 * The part of the page to paint sharply, in page points, once the whole of it no longer fits in
 * one canvas. It follows the scrolling with slack around it, so an ordinary nudge is not a
 * repaint, and it is given up entirely as soon as the whole page fits again.
 */
function useSharpPart(
  ref: RefObject<Element | null>,
  within: RefObject<Element | null>,
  page: PageSize,
  scale: number,
  wanted: boolean,
): Rect | null {
  const [part, setPart] = useState<Rect | null>(null);
  useEffect(() => {
    const element = ref.current;
    const box = within.current;
    if (!wanted || !element || !box) {
      setPart(null);
      return;
    }
    let frame = 0;
    const follow = () => {
      frame = 0;
      const visible = visiblePart(element.getBoundingClientRect(), box.getBoundingClientRect(), scale);
      setPart(current => {
        if (!visible) return null;
        return current && stillFits(current, visible) ? current : withBand(visible, page);
      });
    };
    /** Scrolling asks far more often than a page can be painted, so it asks once a frame. */
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(follow);
    };
    follow();
    box.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      box.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ref, within, page, scale, wanted]);
  return part;
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
  const sharpRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState<RenderedPage | null>(null);
  const [sharp, setSharp] = useState<RenderedPart | null>(null);
  const [unpaintable, setUnpaintable] = useState(false);
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [hovered, setHovered] = useState<Box | undefined>(undefined);
  const [writingAt, setWritingAt] = useState<Point | null>(null);
  const [words, setWords] = useState("");
  const nearby = useNearby(sheetRef, within, PAINT_WITHIN, KEEP_WITHIN);
  /** Painting follows the zoom once it has come to rest; the layout follows it as it moves. */
  const steady = useSettled(scale, SETTLE);
  const density = paintDensity(steady, pixelRatio, size);
  const painted = nearby && !unpaintable;
  const part = useSharpPart(sheetRef, within, size, scale, painted && !wholePageIsSharp(steady, pixelRatio, size));
  const partDensity = part ? paintDensity(steady, pixelRatio, part) : 0;

  useEffect(() => {
    // Letting go of the painted page is the point of the band: it is the larger of the two canvases.
    if (!nearby) {
      setRendered(null);
      return;
    }
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
  }, [pdf, number, density, nearby]);

  /** The part on screen, painted at the size it is being shown at rather than stretched up to it. */
  useEffect(() => {
    if (!part) {
      setSharp(null);
      return;
    }
    let live = true;
    // Whatever is already there stays until the new painting lands, rather than blanking.
    pdf.renderPart(number, partDensity, part).then(
      slice => {
        if (live) setSharp(slice);
      },
      () => {
        if (live) setSharp(null);
      },
    );
    return () => {
      live = false;
    };
  }, [pdf, number, part, partDensity]);

  /**
   * Before the browser paints, in both cases: a canvas is cleared the moment it is given a new
   * size, and a frame of blank white between two paintings of a page is a frame too many.
   */
  useLayoutEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context || !rendered) return;
    paintPage(context, {
      image: rendered.image,
      pixelsPerPoint: rendered.pixelsPerPoint,
      marks: withDraft(marks, drawing, number),
      hovered,
    });
  }, [rendered, marks, drawing, hovered, number]);

  useLayoutEffect(() => {
    const context = sharpRef.current?.getContext("2d");
    if (!context || !sharp) return;
    paintPage(context, {
      image: sharp.image,
      pixelsPerPoint: sharp.pixelsPerPoint,
      at: sharp.at,
      marks: withDraft(marks, drawing, number),
      hovered,
    });
  }, [sharp, marks, drawing, hovered, number]);

  useEffect(() => setHovered(undefined), [tool]);

  const pointOf = (event: ReactPointerEvent<HTMLElement>): Point => {
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

  const startMark = (event: ReactPointerEvent<HTMLElement>): void => {
    // Anything with a say of its own — the caret being typed into — answers for itself.
    if (event.target !== event.currentTarget) return;
    if (drawing) {
      // A second finger is the start of a pinch, and a pinch leaves no ink behind.
      if (event.pointerId !== drawing.pointerId) setDrawing(null);
      return;
    }
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

  const trackPointer = (event: ReactPointerEvent<HTMLElement>): void => {
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

  const finishStroke = (event: ReactPointerEvent<HTMLElement>): void => {
    if (!drawing || event.pointerId !== drawing.pointerId) return;
    onCommand({ kind: "draw", stroke: { page: number, points: drawing.points, width: PEN_WIDTH } });
    setDrawing(null);
  };

  /** A gesture the browser takes over — a system swipe, a call arriving — leaves no ink behind. */
  const dropStroke = (event: ReactPointerEvent<HTMLElement>): void => {
    if (drawing && event.pointerId === drawing.pointerId) setDrawing(null);
  };

  return (
    <div
      ref={sheetRef}
      data-sheet={number}
      className={`relative bg-white shadow-2xl ${cursorFor(tool, hovered !== undefined)}`}
      style={{ width: size.width * scale, height: size.height * scale, touchAction: touchActionFor(tool) }}
      onPointerDown={startMark}
      onPointerMove={trackPointer}
      onPointerUp={finishStroke}
      onPointerCancel={dropStroke}
      onPointerLeave={() => setHovered(undefined)}
    >
      {painted && rendered && (
        // Sized by the painting it is holding, so a zoom stretches that one until the next lands.
        <canvas
          ref={canvasRef}
          data-page={number}
          width={rendered.image.width}
          height={rendered.image.height}
          style={{ width: size.width * scale, height: size.height * scale }}
          className="pointer-events-none block"
        />
      )}
      {painted && sharp && (
        // Over the whole page rather than instead of it, so panning has something to show at once.
        <canvas
          ref={sharpRef}
          data-part={number}
          width={sharp.image.width}
          height={sharp.image.height}
          style={{
            left: sharp.at.x * scale,
            top: sharp.at.y * scale,
            width: (sharp.image.width / sharp.pixelsPerPoint) * scale,
            height: (sharp.image.height / sharp.pixelsPerPoint) * scale,
          }}
          className="pointer-events-none absolute"
        />
      )}
      {nearby && unpaintable && (
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
