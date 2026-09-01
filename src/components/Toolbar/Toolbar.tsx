export type Tool = "draw" | "text" | null;

const ICON = "size-5 stroke-current fill-none stroke-[1.6] [stroke-linecap:round] [stroke-linejoin:round]";

/** Eleven units across: the smallest target a thumb hits reliably. */
const BUTTON =
  "size-11 grid place-items-center rounded-full text-neutral-300 touch-manipulation transition-colors hover:bg-white/10 hover:text-white aria-pressed:bg-white/20 aria-pressed:text-white disabled:pointer-events-none disabled:opacity-30";

function OpenIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden="true">
      <path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function CursorIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden="true">
      <path d="M6 3l12 8.5-5.2 1.1L15 19l-2.4 1-2.2-6.3L6 17z" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden="true">
      <path d="M4 20.5l1-4 10-10 3 3-10 10z" />
      <path d="M14.5 6.5l3 3" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden="true">
      <path d="M5 6h14M12 6v13M9 19h6" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden="true">
      <path d="M9 14l-4-4 4-4" />
      <path d="M5 10h9a5 5 0 0 1 0 10h-4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden="true">
      <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" />
    </svg>
  );
}

type Props = {
  tool: Tool;
  onTool: (tool: Tool) => void;
  onOpen: () => void;
  onClose: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onSave: () => void;
};

export function Toolbar({ tool, onTool, onOpen, onClose, onUndo, canUndo, onSave }: Props) {
  const pick = (wanted: Exclude<Tool, null>) => () => onTool(tool === wanted ? null : wanted);
  return (
    <div
      // Fixed to the screen rather than to the pages, so it stays put however far they are zoomed.
      className="fixed bottom-0 left-1/2 z-20 -translate-x-1/2"
      style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center gap-1 rounded-full bg-neutral-900/90 p-1.5 shadow-xl ring-1 ring-white/10 backdrop-blur">
        <button
          type="button"
          data-tool="none"
          aria-label="Select"
          aria-pressed={tool === null}
          className={BUTTON}
          onClick={() => onTool(null)}
        >
          <CursorIcon />
        </button>
        <button type="button" data-tool="draw" aria-label="Draw" aria-pressed={tool === "draw"} className={BUTTON} onClick={pick("draw")}>
          <PenIcon />
        </button>
        <button type="button" data-tool="text" aria-label="Write" aria-pressed={tool === "text"} className={BUTTON} onClick={pick("text")}>
          <TextIcon />
        </button>
        <button type="button" data-action="undo" aria-label="Undo" disabled={!canUndo} className={BUTTON} onClick={onUndo}>
          <UndoIcon />
        </button>
        <div className="mx-1 h-6 w-px bg-white/10" aria-hidden="true" />
        <button type="button" data-action="open" aria-label="Open another PDF" className={BUTTON} onClick={onOpen}>
          <OpenIcon />
        </button>
        <button type="button" data-action="save" aria-label="Download" className={BUTTON} onClick={onSave}>
          <DownloadIcon />
        </button>
        <button
          type="button"
          data-action="close"
          aria-label="Close this PDF and clear the kept copy"
          className={BUTTON}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
