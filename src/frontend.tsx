import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./app/index.css";
import { downloadFile } from "./app/download";
import { exportPdf } from "./app/export";
import { watchZoomGestures } from "./app/gestures";
import { forgetSession, keepEdits, keepFile, loadSession } from "./app/session";
import { PageView } from "./components/PageView/PageView";
import { Toolbar, type Tool } from "./components/Toolbar/Toolbar";
import { type Command, type Point, marksFrom, marksOnPage, newId, withoutLast } from "./lib/edits";
import { type OpenPdf, type OpenProblem, openPdf } from "./lib/pdf";
import { fitScale, widestPage } from "./lib/viewport";
import { SCALE, atScale, clampZoom, cornerFor, heldAt } from "./lib/zoom";

/** The id is minted per opening, so it tells this file's pages from the last file's. */
type OpenFile = { id: string; name: string; bytes: Uint8Array; pdf: OpenPdf };

/** Past any form worth filling in by hand. Mostly it catches a stray drag of something enormous. */
const MAX_FILE_BYTES = 100 * 1024 * 1024;

const PICKER_ID = "open-pdf";

/** The space above the first page and between the pages, in page points, so it zooms with them. */
const PAGE_GAP = atScale(16);

const TROUBLE: Record<OpenProblem, string> = {
  encrypted: "This PDF is locked with a password, so it cannot be opened here.",
  "too-many-pages": "This PDF has more pages than the editor can open.",
  unreadable: "This file could not be read as a PDF.",
};

function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/** Puts back what the last visit left, and lets go of a kept file that no longer opens. */
async function reopenSession(): Promise<{ file: OpenFile; commands: Command[]; saved: boolean } | null> {
  const session = await loadSession();
  if (!session) return null;
  const opened = await openPdf(Uint8Array.from(session.file.bytes));
  if (!opened.ok) {
    await forgetSession();
    return null;
  }
  return { file: { ...session.file, pdf: opened.pdf }, commands: session.commands, saved: session.saved };
}

/** Reading a chosen file can still fail: it may have been moved or unplugged since it was picked. */
async function readBytes(file: File): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

function OpenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-16 fill-none stroke-current stroke-[1.2] [stroke-linecap:round] [stroke-linejoin:round]" aria-hidden="true">
      <path d="M12 3v9m0 0l-3.5-3.5M12 12l3.5-3.5" />
      <path d="M4 15v3a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-3" />
    </svg>
  );
}

function Spinner() {
  return (
    <div role="status" aria-label="Loading PDF" className="fixed inset-0 z-20 grid place-items-center bg-neutral-900/60">
      <svg viewBox="0 0 24 24" className="size-16 animate-spin fill-none stroke-current stroke-[1.2]" aria-hidden="true">
        <circle cx="12" cy="12" r="9" className="opacity-25" />
        <path d="M21 12a9 9 0 0 0-9-9" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function Notice({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <div role="alert" data-testid="notice" className="fixed inset-x-0 top-0 z-10 grid justify-items-center p-3">
      <p className="flex max-w-md items-center gap-3 rounded-xl bg-neutral-900/95 px-4 py-3 text-sm shadow-xl ring-1 ring-white/10">
        <span>{text}</span>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="grid size-8 shrink-0 place-items-center rounded-full text-neutral-400 touch-manipulation hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current stroke-[1.8] [stroke-linecap:round]" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </p>
    </div>
  );
}

function Editor() {
  const [file, setFile] = useState<OpenFile | null>(null);
  const [commands, setCommands] = useState<Command[]>([]);
  const [tool, setTool] = useState<Tool>(null);
  /** The writing in hand, by id, wherever in the document it sits. Only ever one at a time. */
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** The edits as they stood when they last went to disk as a PDF, so leaving knows what is at stake. */
  const [savedAt, setSavedAt] = useState<readonly Command[] | null>(null);
  /** The zoom the pages have been painted for, which is the zoom the fingers have come to rest at. */
  const [zoom, setZoom] = useState(1);
  const picker = useRef<HTMLInputElement>(null);
  /** Dropped the moment a file is opened by hand, so a restore landing late gives way to it. */
  const restoreWanted = useRef(true);
  const pages = useRef<HTMLDivElement>(null);
  /** The zoom the fingers have asked for, which they may still be moving. */
  const zoomed = useRef(1);
  /** The size a page is laid out at before any zoom, kept where a gesture can reach it. */
  const fitted = useRef(1);
  /** What the fingers came down on, in the pages' own points, until they let go of it. */
  const held = useRef<Point | null>(null);
  const { ref, width } = useContainerWidth();
  /** The size a page is laid out at with no zoom on it, which the window's width decides. */
  const fit = file ? fitScale(width, widestPage(file.pdf.sizes)) : 1;
  const marks = useMemo(() => marksFrom(commands), [commands]);
  const record = (command: Command) => setCommands(previous => [...previous, command]);
  const undo = () => setCommands(withoutLast);
  /** Picking up a tool puts down whatever was in hand: the tools answer for their own pages now. */
  const pickTool = (wanted: Tool): void => {
    setSelected(null);
    setTool(wanted);
  };
  const unsaved = commands.length > 0 && commands !== savedAt;

  /** Lays the pages out at the size the fingers are asking for, without waiting to be rendered. */
  const showZoom = (): void => {
    pages.current?.style.setProperty(SCALE, String(fitted.current * zoomed.current));
  };

  /**
   * Zooms about a point on the screen, and keeps what was under it under it — laying the pages
   * out and putting the scroll right here, inside the gesture, rather than leaving either to a
   * render. Fingers report faster than a document of pages can be rendered again, and a correction
   * worked out from where the pages were two touches ago would leave them growing from the corner.
   *
   * Nothing is painted yet: until the gesture is over, what is on screen is the last painting,
   * stretched. Reading a page again is the better part of a second on a phone, and a hand resting
   * mid-pinch is not an invitation to spend it.
   */
  const zoomAbout = (factor: number, focus: Point): void => {
    const stack = pages.current;
    const scroller = ref.current;
    if (!stack || !scroller) return;
    const before = stack.getBoundingClientRect();
    held.current ??= heldAt({ x: before.left, y: before.top }, focus, fitted.current * zoomed.current);
    const next = clampZoom(zoomed.current * factor);
    if (next === zoomed.current) return;
    zoomed.current = next;
    showZoom();
    const wanted = cornerFor(focus, held.current, fitted.current * next);
    const after = stack.getBoundingClientRect();
    scroller.scrollLeft += after.left - wanted.x;
    scroller.scrollTop += after.top - wanted.y;
  };

  /** The fingers are off the glass, so the pages are worth reading again at the size they now are. */
  const zoomRested = (): void => {
    held.current = null;
    setZoom(zoomed.current);
  };

  /** A file arrives at the size it fits at, whatever the last one was being read at. */
  const resetZoom = (): void => {
    held.current = null;
    zoomed.current = 1;
    showZoom();
    setZoom(1);
  };

  const takeFile = async (chosen: File | undefined): Promise<void> => {
    if (!chosen) return;
    if (chosen.size > MAX_FILE_BYTES) return setNotice("This file is too big to open here.");
    setLoading(true);
    try {
      const bytes = await readBytes(chosen);
      if (!bytes) return setNotice("This file could not be read.");
      const opened = await openPdf(Uint8Array.from(bytes));
      if (!opened.ok) return setNotice(TROUBLE[opened.problem]);
      const kept = { id: newId(), name: chosen.name, bytes };
      // Everything below runs without awaiting, so a restore cannot land between giving way and showing.
      restoreWanted.current = false;
      setNotice(null);
      setTool(null);
      setSelected(null);
      resetZoom();
      setCommands([]);
      setSavedAt(null);
      setFile({ ...kept, pdf: opened.pdf });
      // The pages are on screen by now; a copy of a hundred megabytes need not hold them up.
      if (!(await keepFile(kept))) setNotice("This browser will not keep a copy, so a reload would lose any edits.");
    } finally {
      setLoading(false);
    }
  };

  /** Puts the editor back to holding nothing, on disk as well as on screen. */
  const closeFile = async (): Promise<void> => {
    if (unsaved && !window.confirm("Close this PDF? Edits you have not downloaded will be lost.")) return;
    restoreWanted.current = false;
    setFile(null);
    setCommands([]);
    setSavedAt(null);
    setTool(null);
    setSelected(null);
    resetZoom();
    setNotice(null);
    await forgetSession();
  };

  const save = async (): Promise<void> => {
    if (!file) return;
    try {
      const saved = await exportPdf(file.bytes, marks);
      downloadFile(saved.bytes, file.name);
      setSavedAt(commands);
      if (saved.refused > 0) setNotice("This PDF would not let a ticked box be cleared, so the saved copy still has it ticked.");
    } catch {
      setNotice("This PDF could not be saved.");
    }
  };

  useEffect(() => {
    let live = true;
    setLoading(true);
    reopenSession().then(restored => {
      if (!live) return;
      if (restored && restoreWanted.current) {
        setFile(restored.file);
        setCommands(restored.commands);
        if (restored.saved) setSavedAt(restored.commands);
      }
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (file) void keepEdits(file.id, commands, commands === savedAt);
  }, [file, commands, savedAt]);

  /** Undo can take away what is in hand, and nothing is held once it is no longer on a page. */
  useEffect(() => {
    if (selected && !marks.writings.some(writing => writing.id === selected)) setSelected(null);
  }, [marks, selected]);

  /** The browser writes the wording; all a page may do is say that leaving would cost something. */
  useEffect(() => {
    if (!unsaved) return;
    const confirmLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Safari asks for the deprecated spelling and ignores the other one.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", confirmLeaving);
    return () => window.removeEventListener("beforeunload", confirmLeaving);
  }, [unsaved]);

  /** Zoom is for a file; with none open the browser's own is the one that makes sense. */
  useEffect(() => {
    const scroller = ref.current;
    if (!scroller || !file) return;
    // What it is handed reads nothing but refs, so it stays right however often this rerenders.
    return watchZoomGestures(scroller, { by: zoomAbout, over: zoomRested });
  }, [file, ref]);

  /**
   * After every render, whatever caused it: the pages take their size from a property rather than
   * from what React last laid out, so a window resized mid-pinch is taken in without the fingers
   * losing what they are holding.
   */
  useLayoutEffect(() => {
    fitted.current = fit;
    showZoom();
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      // Escape puts down what is in hand before it puts down the tool: one press, one undoing.
      if (event.key === "Escape") {
        if (selected) setSelected(null);
        else setTool(null);
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selected) {
        // Backspace is the browser's way back a page, and nobody deleting a word means that.
        event.preventDefault();
        record({ kind: "erase", id: selected });
        setSelected(null);
      }
      if (event.key.toLowerCase() === "z" && (event.metaKey || event.ctrlKey)) undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  /** What the pages are painted for. The size they are laid out at is the property's to say. */
  const settled = fit * zoom;
  const pixelRatio = window.devicePixelRatio || 1;

  return (
    <div
      ref={ref}
      className="h-full overflow-auto overscroll-contain"
      onDragOver={event => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={event => {
        event.preventDefault();
        setDragging(false);
        void takeFile(event.dataTransfer.files[0]);
      }}
    >
      <input
        ref={picker}
        id={PICKER_ID}
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Open a PDF"
        className="sr-only"
        onChange={event => {
          const chosen = event.target.files?.[0];
          event.target.value = "";
          void takeFile(chosen);
        }}
      />
      {notice && <Notice text={notice} onDismiss={() => setNotice(null)} />}
      {loading && <Spinner />}
      {file && width > 0 && (
        // Keyed by the opening, so a new file gets new pages rather than the last file's leftovers.
        // Exactly as wide as the widest page, so its corner is the pages' own corner wherever the
        // browser puts it, and the space around them grows with them: zoomed in, everything above a
        // page moves in step with the page itself. The room at the bottom is for the toolbar, which
        // keeps its size on the screen whatever the pages are doing.
        <div
          key={file.id}
          ref={pages}
          className="mx-auto flex w-max flex-col items-center pb-28"
          // The scroll is put where a gesture says; the browser keeping its own place as the pages
          // grow would be a second hand on it, pulling the other way.
          style={{ gap: PAGE_GAP, paddingTop: PAGE_GAP, overflowAnchor: "none" }}
        >
          {file.pdf.sizes.map((size, index) => (
            <PageView
              key={index}
              pdf={file.pdf}
              number={index + 1}
              size={size}
              settled={settled}
              pixelRatio={pixelRatio}
              within={ref}
              marks={marksOnPage(marks, index + 1)}
              tool={tool}
              selected={selected}
              onSelect={setSelected}
              onCommand={record}
            />
          ))}
        </div>
      )}
      {!file && (
        <label htmlFor={PICKER_ID} className="grid h-full cursor-pointer place-items-center">
          <span
            className={`grid size-48 place-items-center rounded-3xl border-2 border-dashed transition-colors ${
              dragging ? "border-neutral-200 text-neutral-100" : "border-neutral-600 text-neutral-500 hover:border-neutral-400 hover:text-neutral-300"
            }`}
          >
            <OpenIcon />
          </span>
        </label>
      )}
      {file && (
        <Toolbar
          tool={tool}
          onTool={pickTool}
          onOpen={() => picker.current?.click()}
          onClose={() => void closeFile()}
          onUndo={undo}
          canUndo={commands.length > 0}
          onSave={() => void save()}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Editor />);
