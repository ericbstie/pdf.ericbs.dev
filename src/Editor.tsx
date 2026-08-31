import { useEffect, useMemo, useRef, useState } from "react";
import { PageView } from "./PageView";
import { Toolbar, type Tool } from "./Toolbar";
import { downloadFile } from "./download";
import { type Command, marksFrom, marksOnPage, withoutLast } from "./edits";
import { exportPdf } from "./export";
import { type OpenPdf, openPdf } from "./pdf";
import { fitScale } from "./viewport";

type OpenFile = { name: string; bytes: Uint8Array; pdf: OpenPdf };

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

function OpenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-16 fill-none stroke-current stroke-[1.2] [stroke-linecap:round] [stroke-linejoin:round]" aria-hidden="true">
      <path d="M12 3v9m0 0l-3.5-3.5M12 12l3.5-3.5" />
      <path d="M4 15v3a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-3" />
    </svg>
  );
}

export function Editor() {
  const [file, setFile] = useState<OpenFile | null>(null);
  const [commands, setCommands] = useState<Command[]>([]);
  const [tool, setTool] = useState<Tool>(null);
  const { ref, width } = useContainerWidth();
  const marks = useMemo(() => marksFrom(commands), [commands]);

  const takeFile = async (chosen: File | undefined): Promise<void> => {
    if (!chosen) return;
    const bytes = new Uint8Array(await chosen.arrayBuffer());
    const pdf = await openPdf(Uint8Array.from(bytes)).catch(() => null);
    if (!pdf) return;
    setCommands([]);
    setFile({ name: chosen.name, bytes, pdf });
  };

  const save = async (): Promise<void> => {
    if (file) downloadFile(await exportPdf(file.bytes, marks), file.name);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === "Escape") setTool(null);
      if (event.key.toLowerCase() === "z" && (event.metaKey || event.ctrlKey)) setCommands(withoutLast);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const scale = file ? fitScale(width, Math.max(...file.pdf.sizes.map(size => size.width))) : 1;
  const pixelsPerPoint = scale * (window.devicePixelRatio || 1);

  return (
    <div
      ref={ref}
      className="h-full overflow-auto"
      onDragOver={event => event.preventDefault()}
      onDrop={event => {
        event.preventDefault();
        void takeFile(event.dataTransfer.files[0]);
      }}
    >
      {file && width > 0 ? (
        <div className="flex flex-col items-center gap-6 py-8">
          {file.pdf.sizes.map((size, index) => (
            <PageView
              key={index}
              pdf={file.pdf}
              number={index + 1}
              size={size}
              scale={scale}
              pixelsPerPoint={pixelsPerPoint}
              marks={marksOnPage(marks, index + 1)}
              tool={tool}
              onCommand={command => setCommands(previous => [...previous, command])}
            />
          ))}
        </div>
      ) : (
        <label className="grid h-full cursor-pointer place-items-center">
          <input
            type="file"
            accept="application/pdf"
            aria-label="Open a PDF"
            className="sr-only"
            onChange={event => void takeFile(event.target.files?.[0])}
          />
          <span className="grid size-48 place-items-center rounded-3xl border-2 border-dashed border-neutral-600 text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-300">
            <OpenIcon />
          </span>
        </label>
      )}
      {file && <Toolbar tool={tool} onTool={setTool} onSave={() => void save()} />}
    </div>
  );
}
