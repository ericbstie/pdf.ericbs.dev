import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { type Box, type Command, type Marks, type Point, type Rect, type Writing, newId } from "../../lib/edits";
import type { OpenPdf, PageSize, RenderedPage, RenderedPart } from "../../lib/pdf";
import { paintPage } from "./render";
import { TEXT_LAYER, type TextPainting, paintText } from "./textlayer";
import { keepEncodable } from "../../lib/text";
import type { Tool } from "../Toolbar/Toolbar";
import {
  boxAt,
  paintDensity,
  reachFor,
  stillFits,
  toPagePoint,
  visiblePart,
  wholePageIsSharp,
  withBand,
} from "../../lib/viewport";
import { WRITING_FONT, textWidth, writingAt, writingRect } from "./writing";
import { atScale } from "../../lib/zoom";

const PEN_WIDTH = 2;
const TEXT_SIZE = 14;

/** How close a page comes before it is painted, and how much further it goes before it is let go. */
const PAINT_WITHIN = "150%";
const KEEP_WITHIN = "300%";

/** The finger or cursor a stroke belongs to, so a second one cannot join in halfway through. */
type Drawing = { pointerId: number; points: Point[] };

/**
 * A writing being carried. `grab` is where the pointer came down and `origin` where the writing
 * was, so the two of them together say how far it has been taken from where it started.
 */
type Carrying = {
  pointerId: number;
  id: string;
  /** Where the pointer came down, on the page and on the screen: the page says where the writing
   * goes, the screen says whether the hand moved at all. */
  grab: Point;
  from: Point;
  origin: Point;
  at: Point;
  /** Whether letting go without having moved opens the caret, which only a writing already in
   * hand does: the press that picks one up for the first time is the press that selects it. */
  opens: boolean;
};

/** A caret open on the page: on a writing already there, by its id, or on bare paper at a point. */
type Draft = { of: string | null; at: Point; words: string };

type Props = {
  pdf: OpenPdf;
  number: number;
  size: PageSize;
  /**
   * The size the page is painted for, in pixels per point. It is the size the page is laid out at
   * too, except while a pinch is moving: the layout follows the fingers through a property on the
   * pages, and the painting catches up when they stop.
   */
  settled: number;
  pixelRatio: number;
  /** The box the pages scroll inside, which decides when a page is close enough to be worth painting. */
  within: RefObject<Element | null>;
  marks: Marks;
  tool: Tool;
  /** The writing in hand anywhere in the document, so only the page holding it draws a box round it. */
  selected: string | null;
  onSelect: (id: string | null) => void;
  onCommand: (command: Command) => void;
};

/**
 * The page as it stands this moment rather than as it has been committed: the stroke still under
 * the pen, the writing still under the finger, and not the one whose letters are in the caret.
 */
function asShown(marks: Marks, page: number, drawing: Drawing | null, carrying: Carrying | null, editing: string | null): Marks {
  return {
    ...marks,
    strokes: drawing ? [...marks.strokes, { page, points: drawing.points, width: PEN_WIDTH }] : marks.strokes,
    writings: marks.writings.flatMap(writing => {
      if (writing.id === editing) return [];
      return [carrying && writing.id === carrying.id ? { ...writing, at: carrying.at } : writing];
    }),
  };
}

/**
 * Whether the press landed on the page itself, rather than on something with a say of its own —
 * the caret, the box round a writing. The transparent words laid over the page count as the page:
 * a tick or a writing under them is still to be found, and it is only the bare gaps between the
 * words that the page would have heard about anyway.
 */
function onPaper(event: ReactPointerEvent<HTMLElement>): boolean {
  const target = event.target as HTMLElement;
  return target === event.currentTarget || target.closest(`.${TEXT_LAYER}`) !== null;
}

function cursorFor(tool: Tool, overSomething: boolean): string {
  if (tool === "draw") return "cursor-crosshair";
  if (tool === "text") return "cursor-text";
  return overSomething ? "cursor-pointer" : "cursor-default";
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

/** A page is laid out to a fraction of a pixel, so its size never lands exactly on the painted one. */
const STEADY_ENOUGH = 0.001;

/**
 * The part of the page to paint sharply, in page points, once the whole of it no longer fits in
 * one canvas. It follows the scrolling with slack around it, so an ordinary nudge is not a
 * repaint, and it is given up entirely as soon as the whole page fits again.
 */
function useSharpPart(
  ref: RefObject<Element | null>,
  within: RefObject<Element | null>,
  page: PageSize,
  settled: number,
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
      const sheet = element.getBoundingClientRect();
      // The page is its own measure of how big it is being drawn, and while a pinch is still
      // moving it is bigger than what has been painted: what is in hand stretches until it stops.
      if (Math.abs(sheet.width / page.width - settled) > STEADY_ENOUGH) return;
      const visible = visiblePart(sheet, box.getBoundingClientRect(), settled);
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
  }, [ref, within, page, settled, wanted]);
  return part;
}

/** Mobile Safari zooms the whole page in on any field smaller than this, and never zooms back out. */
const NO_ZOOM_SIZE = 16;

type WritingFieldProps = {
  at: Point;
  /** The size the page is painted at: a caret typed into mid-pinch catches up when it ends. */
  settled: number;
  size: number;
  value: string;
  onChange: (words: string) => void;
  onCommit: () => void;
  onCancel: () => void;
};

/** A caret sitting on the page itself, so what you type is where it will print. */
function WritingField({ at, settled, size, value, onChange, onCommit, onCancel }: WritingFieldProps) {
  const drawn = size * settled;
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
        // Placed by the property the pages are sized from, so a pinch carries the caret with them.
        left: atScale(at.x),
        top: atScale(at.y - size * 0.5),
        fontSize: typed,
        lineHeight: `${typed}px`,
        height: typed,
        width: `${Math.max(1, value.length)}ch`,
        // Typed at a size the phone will not zoom into, then shrunk to the size it will print at.
        transform: `scale(${drawn / typed})`,
        transformOrigin: "top left",
        fontFamily: WRITING_FONT,
      }}
      className="absolute bg-transparent p-0 text-neutral-900 caret-neutral-900 outline-none"
    />
  );
}

type SelectionProps = {
  rect: Rect;
  onGrab: (event: ReactPointerEvent<HTMLElement>) => void;
  onCarry: (event: ReactPointerEvent<HTMLElement>) => void;
  onRelease: (event: ReactPointerEvent<HTMLElement>) => void;
  onDrop: (event: ReactPointerEvent<HTMLElement>) => void;
  onRemove: () => void;
};

/**
 * The box around the writing in hand. It is the writing's own element, which is what makes it
 * draggable under a finger: the page beneath it scrolls, and this does not.
 *
 * A pointer it has taken hold of is its own. The page below carries writings too, and would
 * otherwise carry this one a second time and put it down twice, on one drag.
 */
function Selection({ rect, onGrab, onCarry, onRelease, onDrop, onRemove }: SelectionProps) {
  const alone = (answer: (event: ReactPointerEvent<HTMLElement>) => void) => (event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation();
    answer(event);
  };
  return (
    <div
      data-testid="text-selection"
      className="absolute cursor-move"
      style={{
        left: atScale(rect.x),
        top: atScale(rect.y),
        width: atScale(rect.width),
        height: atScale(rect.height),
        // The box is the one thing on the page a finger drags rather than scrolls.
        touchAction: "none",
      }}
      onPointerDown={alone(onGrab)}
      onPointerMove={alone(onCarry)}
      onPointerUp={alone(onRelease)}
      onPointerCancel={alone(onDrop)}
    >
      {/* A line of type is thinner than a fingertip, so the box is taken hold of from beyond it. */}
      <span className="absolute -inset-2" />
      <span className="absolute inset-0 rounded-xs ring-2 ring-blue-500/60" />
      <button
        type="button"
        data-testid="remove-text"
        aria-label="Remove"
        // Clear of the corner rather than over it: a line of type zoomed out is smaller than this
        // button, and an X sitting on top of one would be all there was left to take hold of.
        className="absolute bottom-full left-full grid size-6 place-items-center rounded-full bg-neutral-900 text-neutral-300 shadow-md ring-1 ring-white/20 touch-manipulation hover:bg-neutral-800 hover:text-white"
        onPointerDown={event => event.stopPropagation()}
        onClick={onRemove}
      >
        <svg viewBox="0 0 24 24" className="size-3.5 fill-none stroke-current stroke-[2.4] [stroke-linecap:round]" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Far enough to have been carried somewhere rather than merely clicked, in screen pixels. The
 * question is whether the hand moved, which the page's zoom has no say in: measured on the page, a
 * threshold that is a deliberate drag zoomed in is less than a fingertip's own wobble zoomed out.
 */
const A_NUDGE = 4;

export function PageView({ pdf, number, size, settled, pixelRatio, within, marks, tool, selected, onSelect, onCommand }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sharpRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState<RenderedPage | null>(null);
  const [sharp, setSharp] = useState<RenderedPart | null>(null);
  const [unpaintable, setUnpaintable] = useState(false);
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [carrying, setCarrying] = useState<Carrying | null>(null);
  const [hovered, setHovered] = useState<Box | undefined>(undefined);
  const [overWriting, setOverWriting] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const nearby = useNearby(sheetRef, within, PAINT_WITHIN, KEEP_WITHIN);
  const density = paintDensity(settled, pixelRatio, size);
  const painted = nearby && !unpaintable;
  const part = useSharpPart(sheetRef, within, size, settled, painted && !wholePageIsSharp(settled, pixelRatio, size));
  const partDensity = part ? paintDensity(settled, pixelRatio, part) : 0;
  /** Which writing the caret is open on, if any: a stable name, so typing is not a repaint. */
  const editing = draft?.of ?? null;
  const held = marks.writings.find(writing => writing.id === selected);
  /** Where the box is drawn: under the finger while it is being carried, at its place otherwise. */
  const boxAround = held && (carrying?.id === held.id ? { ...held, at: carrying.at } : held);

  const boxOf = (writing: Writing): Rect => writingRect(writing, textWidth(writing.text, writing.size));

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
      marks: asShown(marks, number, drawing, carrying, editing),
      hovered,
    });
  }, [rendered, marks, drawing, carrying, editing, hovered, number]);

  useLayoutEffect(() => {
    const context = sharpRef.current?.getContext("2d");
    if (!context || !sharp) return;
    paintPage(context, {
      image: sharp.image,
      pixelsPerPoint: sharp.pixelsPerPoint,
      at: sharp.at,
      marks: asShown(marks, number, drawing, carrying, editing),
      hovered,
    });
  }, [sharp, marks, drawing, carrying, editing, hovered, number]);

  /** The page's own words, laid over the painting of them so they can be selected and copied. */
  useEffect(() => {
    const container = textRef.current;
    if (!container) return;
    let live = true;
    let painting: TextPainting | null = null;
    pdf.textOf(number).then(
      text => {
        if (live) painting = paintText(container, text);
      },
      // A page whose words cannot be read is a page with nothing to select, and nothing more.
      () => {},
    );
    return () => {
      live = false;
      painting?.cancel();
      container.replaceChildren();
    };
  }, [pdf, number, painted]);

  useEffect(() => {
    setHovered(undefined);
    setOverWriting(false);
  }, [tool]);

  /** Where a point on the screen falls on the page, in the page's own points. */
  const pointOn = (bounds: DOMRect, event: { clientX: number; clientY: number }): Point => {
    // Taken from the page as it is drawn this moment, which a pinch may have moved since the paint.
    const drawnAt = bounds.width / size.width;
    return toPagePoint({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, drawnAt);
  };

  const pointOf = (event: ReactPointerEvent<HTMLElement>): Point =>
    pointOn(event.currentTarget.getBoundingClientRect(), event);

  /** From a child of the sheet, which is not the sheet and so cannot be measured for it. */
  const pointOnSheet = (event: ReactPointerEvent<HTMLElement>): Point =>
    pointOn(sheetRef.current!.getBoundingClientRect(), event);

  const finishDraft = (): void => {
    if (!draft) return;
    setDraft(null);
    if (draft.of === null) {
      if (draft.words.trim() !== "") {
        onCommand({ kind: "write", writing: { id: newId(), page: number, at: draft.at, text: draft.words, size: TEXT_SIZE } });
      }
      return;
    }
    const before = marks.writings.find(writing => writing.id === draft.of);
    if (!before) return;
    // Rubbed out to nothing but spaces, a writing has said what it wants: to not be there.
    if (draft.words.trim() === "") {
      onCommand({ kind: "erase", id: before.id });
      onSelect(null);
      return;
    }
    if (draft.words !== before.text) onCommand({ kind: "revise", writing: { ...before, text: draft.words } });
  };

  const startMark = (event: ReactPointerEvent<HTMLElement>): void => {
    // Anything with a say of its own — the caret, the box round a writing — answers for itself.
    if (!onPaper(event)) return;
    if (carrying) {
      // A second finger is the start of a pinch, and a pinch carries no writing with it. It comes
      // down on the page rather than on the box, which is why the box cannot be the one to notice.
      if (event.pointerId !== carrying.pointerId) setCarrying(null);
      return;
    }
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
      finishDraft();
      setDraft({ of: null, at, words: "" });
      return;
    }
    // The caret is closed by this very click, and blur comes after the pointer: were it left to
    // blur, what was typed would be recorded after the tick it preceded, and undo would take back
    // the wrong one of the two.
    finishDraft();
    const reach = reachFor(event.pointerType);
    const writing = writingAt(marks.writings, boxOf, at, reach);
    if (writing) {
      // Picked up by the press that finds it, rather than by a second one on the box it puts
      // there: a hand that presses on a writing and moves is carrying it, and says so in one go.
      // The drag carries the writing rather than sweeping a selection through the words under it.
      event.preventDefault();
      onSelect(writing.id);
      pickUp(event, writing, selected === writing.id);
      return;
    }
    onSelect(null);
    const box = boxAt(rendered?.boxes ?? [], at, reach);
    if (box) {
      event.preventDefault();
      onCommand({ kind: "toggle", box });
    }
  };

  const trackPointer = (event: ReactPointerEvent<HTMLElement>): void => {
    if (carrying) {
      carryWriting(event);
      return;
    }
    const at = pointOf(event);
    if (drawing) {
      if (event.pointerId !== drawing.pointerId) return;
      setDrawing(current => (current ? { ...current, points: [...current.points, at] } : current));
      return;
    }
    if (tool === null && event.pointerType === "mouse") {
      const reach = reachFor(event.pointerType);
      setOverWriting(writingAt(marks.writings, boxOf, at, reach) !== undefined);
      setHovered(boxAt(rendered?.boxes ?? [], at, reach));
    }
  };

  const finishStroke = (event: ReactPointerEvent<HTMLElement>): void => {
    if (carrying) {
      releaseWriting(event);
      return;
    }
    if (!drawing || event.pointerId !== drawing.pointerId) return;
    onCommand({ kind: "draw", stroke: { page: number, points: drawing.points, width: PEN_WIDTH } });
    setDrawing(null);
  };

  /** A gesture the browser takes over — a system swipe, a call arriving — leaves no ink behind. */
  const dropStroke = (event: ReactPointerEvent<HTMLElement>): void => {
    dropWriting(event);
    if (drawing && event.pointerId === drawing.pointerId) setDrawing(null);
  };

  /** Takes hold of a writing under the pointer, and follows that pointer wherever it goes next. */
  const pickUp = (event: ReactPointerEvent<HTMLElement>, writing: Writing, opens: boolean): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setCarrying({
      pointerId: event.pointerId,
      id: writing.id,
      grab: pointOnSheet(event),
      from: { x: event.clientX, y: event.clientY },
      origin: writing.at,
      at: writing.at,
      opens,
    });
  };

  const grabWriting = (event: ReactPointerEvent<HTMLElement>): void => {
    if (carrying) {
      // A second finger is the start of a pinch, and a pinch carries no writing with it.
      if (event.pointerId !== carrying.pointerId) setCarrying(null);
      return;
    }
    if (!held) return;
    pickUp(event, held, true);
  };

  /**
   * A writing goes no further than the page it belongs to. Past the edge the canvas clips it and
   * the saved file places it off the sheet, so it would be gone from both while still holding a
   * place in the undo — and held here rather than on release, so the box stops where it will land.
   */
  const ontoPage = (point: Point): Point => ({
    x: Math.min(Math.max(point.x, 0), size.width),
    y: Math.min(Math.max(point.y, 0), size.height),
  });

  const carryWriting = (event: ReactPointerEvent<HTMLElement>): void => {
    if (!carrying || event.pointerId !== carrying.pointerId) return;
    const at = pointOnSheet(event);
    setCarrying({
      ...carrying,
      at: ontoPage({ x: carrying.origin.x + at.x - carrying.grab.x, y: carrying.origin.y + at.y - carrying.grab.y }),
    });
  };

  /** Let go having gone somewhere, and it has been moved; let go where it began, and it was a click. */
  const releaseWriting = (event: ReactPointerEvent<HTMLElement>): void => {
    if (!carrying || event.pointerId !== carrying.pointerId) return;
    setCarrying(null);
    const writing = marks.writings.find(one => one.id === carrying.id);
    if (!writing) return;
    if (Math.hypot(event.clientX - carrying.from.x, event.clientY - carrying.from.y) > A_NUDGE) {
      onCommand({ kind: "revise", writing: { ...writing, at: carrying.at } });
      return;
    }
    if (carrying.opens) setDraft({ of: writing.id, at: writing.at, words: writing.text });
  };

  const dropWriting = (event: ReactPointerEvent<HTMLElement>): void => {
    if (carrying && event.pointerId === carrying.pointerId) setCarrying(null);
  };

  return (
    <div
      ref={sheetRef}
      data-sheet={number}
      className={`relative bg-white shadow-2xl ${cursorFor(tool, hovered !== undefined || overWriting)}`}
      style={{ width: atScale(size.width), height: atScale(size.height), touchAction: touchActionFor(tool) }}
      onPointerDown={startMark}
      onPointerMove={trackPointer}
      onPointerUp={finishStroke}
      onPointerCancel={dropStroke}
      onPointerLeave={() => {
        setHovered(undefined);
        setOverWriting(false);
      }}
    >
      {painted && rendered && (
        // Sized by the painting it is holding, so a zoom stretches that one until the next lands.
        <canvas
          ref={canvasRef}
          data-page={number}
          width={rendered.image.width}
          height={rendered.image.height}
          style={{ width: atScale(size.width), height: atScale(size.height) }}
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
            left: atScale(sharp.at.x),
            top: atScale(sharp.at.y),
            width: atScale(sharp.image.width / sharp.pixelsPerPoint),
            height: atScale(sharp.image.height / sharp.pixelsPerPoint),
          }}
          className="pointer-events-none absolute"
        />
      )}
      {painted && (
        // Only with nothing in hand: with the pen out a drag draws, and with the caret out it writes.
        <div ref={textRef} data-text={number} data-live={tool === null} className={TEXT_LAYER} />
      )}
      {nearby && unpaintable && (
        <p className="grid h-full place-items-center p-6 text-center text-sm text-neutral-500">
          This page could not be drawn.
        </p>
      )}
      {boxAround && !draft && (
        <Selection
          rect={boxOf(boxAround)}
          onGrab={grabWriting}
          onCarry={carryWriting}
          onRelease={releaseWriting}
          onDrop={dropWriting}
          onRemove={() => {
            onCommand({ kind: "erase", id: boxAround.id });
            onSelect(null);
          }}
        />
      )}
      {draft && (
        <WritingField
          at={draft.at}
          settled={settled}
          size={TEXT_SIZE}
          value={draft.words}
          onChange={words => setDraft(current => (current ? { ...current, words } : current))}
          onCommit={finishDraft}
          onCancel={() => setDraft(null)}
        />
      )}
    </div>
  );
}
