import type { RefObject } from "react";
import { type Command, type Marks, marksOnPage } from "../../lib/edits";
import type { OpenPdf } from "../../lib/pdf";
import { atScale } from "../../lib/zoom";
import { PageView } from "../PageView/PageView";
import type { Tool } from "../Toolbar/Toolbar";

/** The space above the first page and between the pages, in page points, so it zooms with them. */
const PAGE_GAP = atScale(16);

type Props = {
  pdf: OpenPdf;
  /** The stack itself, which a zoom gesture lays out by hand rather than waiting for a render. */
  ref: RefObject<HTMLDivElement | null>;
  settled: number;
  pixelRatio: number;
  /** The box the pages scroll inside, which decides when a page is close enough to be worth painting. */
  within: RefObject<Element | null>;
  marks: Marks;
  tool: Tool;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onCommand: (command: Command) => void;
};

/**
 * Every page of the open file, one under the other. Exactly as wide as the widest page, so its
 * corner is the pages' own corner wherever the browser puts it, and the space around them grows
 * with them: zoomed in, everything above a page moves in step with the page itself. The room at
 * the bottom is for the toolbar, which keeps its size on the screen whatever the pages are doing.
 */
export function PageStack({ pdf, ref, settled, pixelRatio, within, marks, tool, selected, onSelect, onCommand }: Props) {
  return (
    <div
      ref={ref}
      className="mx-auto flex w-max flex-col items-center pb-28"
      // The scroll is put where a gesture says; the browser keeping its own place as the pages
      // grow would be a second hand on it, pulling the other way.
      style={{ gap: PAGE_GAP, paddingTop: PAGE_GAP, overflowAnchor: "none" }}
    >
      {pdf.sizes.map((size, index) => (
        <PageView
          key={index}
          pdf={pdf}
          number={index + 1}
          size={size}
          settled={settled}
          pixelRatio={pixelRatio}
          within={within}
          marks={marksOnPage(marks, index + 1)}
          tool={tool}
          selected={selected}
          onSelect={onSelect}
          onCommand={onCommand}
        />
      ))}
    </div>
  );
}
