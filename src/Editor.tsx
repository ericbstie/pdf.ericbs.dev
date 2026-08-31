import { useEffect, useMemo, useRef, useState } from "react";
import { PageView } from "./PageView";
import { Toolbar, type Tool } from "./Toolbar";
import { downloadFile } from "./download";
import { type Command, marksFrom, marksOnPage, withoutLast } from "./edits";
import { exportPdf } from "./export";
import { type OpenPdf, type OpenProblem, openPdf } from "./pdf";
import { fitScale, widestPage } from "./viewport";

/** `opening` counts openings rather than files: it is what tells one page 1 from the next one. */
type OpenFile = { opening: number; name: string; bytes: Uint8Array; pdf: OpenPdf };

/** Well past any form worth filling in by hand, and short of what would sink the tab. */
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
  const picker = useRef<HTMLInputElement>(null);
  const openings = useRef(0);
  const { ref, width } = useContainerWidth();
  const marks = useMemo(() => marksFrom(commands), [commands]);
  const undo = () => setCommands(withoutLast);

  const takeFile = async (chosen: File | undefined): Promise<void> => {
    if (!chosen) return;
    if (chosen.size > MAX_FILE_BYTES) return setNotice("This file is too big to open here.");
    const bytes = await readBytes(chosen);
    if (!bytes) return setNotice("This file could not be read.");
    const opened = await openPdf(Uint8Array.from(bytes));
    if (!opened.ok) return setNotice(TROUBLE[opened.problem]);
    setNotice(null);
    setTool(null);
    setCommands([]);
    setFile({ opening: (openings.current += 1), name: chosen.name, bytes, pdf: opened.pdf });
  };

  const save = async (): Promise<void> => {
    if (!file) return;
    try {
      downloadFile(await exportPdf(file.bytes, marks), file.name);
    } catch {
      setNotice("This PDF could not be saved.");
    }
  };

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
      {file && width > 0 ? (
        // Keyed by opening, so a new file gets new pages rather than the last file's leftovers.
        <div key={file.opening} className="flex flex-col items-center gap-6 pt-8 pb-28">
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
      ) : (
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
