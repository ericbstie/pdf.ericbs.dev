import { TextLayer } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PageText } from "./pdf";

/** The class the stylesheet dresses the layer in, and which the tests find it by. */
export const TEXT_LAYER = "text-layer";

/** A layer being built, which a page scrolled away from before it finished can call off. */
export type TextPainting = { done: Promise<void>; cancel: () => void };

/**
 * Lays the page's own words over the painting of it, in transparent type placed to sit exactly on
 * the printed letters. Nothing of it is seen; what it is for is that a drag selects real text,
 * that the selection can be copied, and that the browser's own find has something to find.
 *
 * Built at scale 1, so the layer is measured in page points like everything else here, and pdf.js
 * places every word as a percentage of the page. The one property the pages are sized from then
 * carries the words with them, and a pinch needs no rebuilding.
 */
export function paintText(container: HTMLElement, text: PageText): TextPainting {
  const layer = new TextLayer({ textContentSource: text.source, container, viewport: text.viewport });
  // pdf.js sizes the container from a zoom of its own; here the sheet underneath is the measure.
  container.style.width = "100%";
  container.style.height = "100%";
  return { done: layer.render(), cancel: () => layer.cancel() };
}
