import { useEffect, useMemo, useRef, useState } from "react";
import { PageView } from "./PageView";
import { Toolbar, type Tool } from "./Toolbar";
import { downloadFile } from "./download";
import { type Command, marksFrom, marksOnPage, withoutLast } from "./edits";
import { exportPdf } from "./export";
import { type OpenPdf, type OpenProblem, openPdf } from "./pdf";
import { forgetSession, keepEdits, keepFile, loadSession, newFileId } from "./session";
import { fitScale, widestPage } from "./viewport";

/** The id is minted per opening, so it tells this file's pages from the last file's. */
type OpenFile = { id: string; name: string; bytes: Uint8Array; pdf: OpenPdf };

/** Past any form worth filling in by hand. Mostly it catches a stray drag of something enormous. */
const MAX_FILE_BYTES = 100 * 1024 * 1024;

const PICKER_ID = "open-pdf";

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
async function reopenSession(): Promise<{ file: OpenFile; commands: Command[] } | null> {
  const session = await loadSession();
  if (!session) return null;
  const opened = await openPdf(Uint8Array.from(session.file.bytes));
  if (!opened.ok) {
    await forgetSession();
    return null;
  }
  return { file: { ...session.file, pdf: opened.pdf }, commands: session.commands };
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

export function Editor() {
  const [file, setFile] = useState<OpenFile | null>(null);
  const [commands, setCommands] = useState<Command[]>([]);
  const [tool, setTool] = useState<Tool>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  /** The edits as they stood when they last went to disk as a PDF, so leaving knows what is at stake. */
  const [savedAt, setSavedAt] = useState<readonly Command[] | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const { ref, width } = useContainerWidth();
  const marks = useMemo(() => marksFrom(commands), [commands]);
  const undo = () => setCommands(withoutLast);
  const unsaved = commands.length > 0 && commands !== savedAt;

  const takeFile = async (chosen: File | undefined): Promise<void> => {
    if (!chosen) return;
    if (chosen.size > MAX_FILE_BYTES) return setNotice("This file is too big to open here.");
    const bytes = await readBytes(chosen);
    if (!bytes) return setNotice("This file could not be read.");
    const opened = await openPdf(Uint8Array.from(bytes));
    if (!opened.ok) return setNotice(TROUBLE[opened.problem]);
    const kept = { id: newFileId(), name: chosen.name, bytes };
    const survives = await keepFile(kept);
    setNotice(survives ? null : "This browser will not keep a copy, so a reload would lose any edits.");
    setTool(null);
    setCommands([]);
    setFile({ ...kept, pdf: opened.pdf });
  };

  const save = async (): Promise<void> => {
    if (!file) return;
    try {
      downloadFile(await exportPdf(file.bytes, marks), file.name);
      setSavedAt(commands);
    } catch {
      setNotice("This PDF could not be saved.");
    }
  };

  useEffect(() => {
    let live = true;
    reopenSession().then(restored => {
      if (!live) return;
      if (restored) {
        setFile(restored.file);
        setCommands(restored.commands);
      }
      setRestoring(false);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (file) void keepEdits(file.id, commands);
  }, [file, commands]);

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === "Escape") setTool(null);
      if (event.key.toLowerCase() === "z" && (event.metaKey || event.ctrlKey)) undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const scale = file ? fitScale(width, widestPage(file.pdf.sizes)) : 1;
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
      {file && width > 0 && (
        // Keyed by the opening, so a new file gets new pages rather than the last file's leftovers.
        <div key={file.id} className="flex flex-col items-center gap-6 pt-8 pb-28">
          {file.pdf.sizes.map((size, index) => (
            <PageView
              key={index}
              pdf={file.pdf}
              number={index + 1}
              size={size}
              scale={scale}
              pixelRatio={pixelRatio}
              within={ref}
              marks={marksOnPage(marks, index + 1)}
              tool={tool}
              onCommand={command => setCommands(previous => [...previous, command])}
            />
          ))}
        </div>
      )}
      {!file && !restoring && (
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
          onTool={setTool}
          onOpen={() => picker.current?.click()}
          onUndo={undo}
          canUndo={commands.length > 0}
          onSave={() => void save()}
        />
      )}
    </div>
  );
}
