export type Tool = "draw" | "text" | null;

const ICON = "size-5 stroke-current fill-none stroke-[1.6] [stroke-linecap:round] [stroke-linejoin:round]";
const BUTTON =
  "size-10 grid place-items-center rounded-full text-neutral-300 transition-colors hover:bg-white/10 hover:text-white aria-pressed:bg-white/20 aria-pressed:text-white";

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
  onSave: () => void;
};

export function Toolbar({ tool, onTool, onSave }: Props) {
  const pick = (wanted: Exclude<Tool, null>) => () => onTool(tool === wanted ? null : wanted);
  return (
    <div className="fixed bottom-6 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-neutral-900/90 p-1.5 shadow-xl ring-1 ring-white/10 backdrop-blur">
      <button type="button" data-tool="draw" aria-label="Draw" aria-pressed={tool === "draw"} className={BUTTON} onClick={pick("draw")}>
        <PenIcon />
      </button>
      <button type="button" data-tool="text" aria-label="Write" aria-pressed={tool === "text"} className={BUTTON} onClick={pick("text")}>
        <TextIcon />
      </button>
      <button type="button" data-action="save" aria-label="Download" className={BUTTON} onClick={onSave}>
        <DownloadIcon />
      </button>
    </div>
  );
}
