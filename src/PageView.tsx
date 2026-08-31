import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import type { Box, Command, Marks, Point } from "./edits";
import type { OpenPdf, PageSize, RenderedPage } from "./pdf";
import { paintPage } from "./render";
import { keepEncodable } from "./text";
import type { Tool } from "./Toolbar";
import { boxAt, toPagePoint } from "./viewport";

const PEN_WIDTH = 2;
const TEXT_SIZE = 14;

type Props = {
  pdf: OpenPdf;
  number: number;
  size: PageSize;
  scale: number;
  pixelsPerPoint: number;
  marks: Marks;
  tool: Tool;
  onCommand: (command: Command) => void;
};

function withDraft(marks: Marks, draft: Point[] | null, page: number): Marks {
  if (!draft) return marks;
  return { ...marks, strokes: [...marks.strokes, { page, points: draft, width: PEN_WIDTH }] };
}

function cursorFor(tool: Tool, overBox: boolean): string {
  if (tool === "draw") return "cursor-crosshair";
  if (tool === "text") return "cursor-text";
  return overBox ? "cursor-pointer" : "cursor-default";
}

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
  const keys: Record<string, () => void> = { Enter: onCommit, Escape: onCancel };
  return (
    <input
      data-testid="text-input"
      aria-label="Write"
      autoFocus
      value={value}
      onChange={event => onChange(keepEncodable(event.target.value))}
      onKeyDown={event => keys[event.key]?.()}
      onBlur={onCommit}
      style={{
        left: at.x * scale,
        top: (at.y - size * 0.5) * scale,
        fontSize: size * scale,
        lineHeight: `${size * scale}px`,
        height: size * scale,
        width: `${Math.max(1, value.length)}ch`,
        fontFamily: "Helvetica, Arial, sans-serif",
      }}
      className="absolute bg-transparent p-0 text-neutral-900 caret-neutral-900 outline-none"
    />
  );
}

export function PageView({ pdf, number, size, scale, pixelsPerPoint, marks, tool, onCommand }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState<RenderedPage | null>(null);
  const [draft, setDraft] = useState<Point[] | null>(null);
  const [hovered, setHovered] = useState<Box | undefined>(undefined);
  const [writingAt, setWritingAt] = useState<Point | null>(null);
  const [words, setWords] = useState("");

  useEffect(() => {
    let live = true;
    pdf.render(number, pixelsPerPoint).then(page => {
      if (live) setRendered(page);
    });
    return () => {
      live = false;
    };
  }, [pdf, number, pixelsPerPoint]);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context || !rendered) return;
    paintPage(context, { image: rendered.image, pixelsPerPoint, marks: withDraft(marks, draft, number), hovered });
  }, [rendered, marks, draft, hovered, pixelsPerPoint, number]);

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
    const at = pointOf(event);
    if (tool === "draw") {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDraft([at]);
      return;
    }
    if (tool === "text") {
      event.preventDefault();
      finishWriting();
      setWritingAt(at);
      return;
    }
    const box = boxAt(rendered?.boxes ?? [], at);
    if (box) onCommand({ kind: "toggle", box });
  };

  const trackPointer = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const at = pointOf(event);
    if (draft) {
      setDraft(points => (points ? [...points, at] : points));
      return;
    }
    if (tool === null) setHovered(boxAt(rendered?.boxes ?? [], at));
  };

  const finishStroke = (): void => {
    if (!draft) return;
    onCommand({ kind: "draw", stroke: { page: number, points: draft, width: PEN_WIDTH } });
    setDraft(null);
  };

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        data-page={number}
        width={Math.ceil(size.width * pixelsPerPoint)}
        height={Math.ceil(size.height * pixelsPerPoint)}
        style={{ width: size.width * scale, height: size.height * scale }}
        className={`block bg-white shadow-2xl ${cursorFor(tool, hovered !== undefined)}`}
        onPointerDown={startMark}
        onPointerMove={trackPointer}
        onPointerUp={finishStroke}
        onPointerLeave={() => setHovered(undefined)}
      />
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
