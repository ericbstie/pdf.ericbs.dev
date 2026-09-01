import { TextLayer } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PageText } from "./pdf";
import { atScale } from "./zoom";

/** The class the stylesheet dresses the layer in, and which the tests find it by. */
export const TEXT_LAYER = "text-layer";

/** A layer being built, which a page scrolled away from before it finished can call off. */
export type TextPainting = { done: Promise<void>; cancel: () => void };

/**
 * Lays the page's own words over the painting of it, in transparent type placed to sit exactly on
 * the printed letters. Nothing of it is seen; what it is for is that a drag selects real text and
 * that the selection can be copied. The browser's own find reaches these words too, though only
 * as far as the pages that are laid out: a page too far off to be painted carries none of them.
 *
 * Built at scale 1, so the layer is measured in page points like everything else here, and pdf.js
 * places every word as a percentage of the page. The one property the pages are sized from then
 * carries the words with them, and a pinch needs no rebuilding.
 *
 * The layer is laid out upright whatever way up the page arrived, since that is the space every
 * word is placed in, and the stylesheet turns the whole of it onto the sheet afterwards — by the
 * angle pdf.js writes onto the container itself.
 */
export function paintText(container: HTMLElement, text: PageText): TextPainting {
  const layer = new TextLayer({ textContentSource: text.source, container, viewport: text.viewport });
  // pdf.js sizes the container from a zoom of its own; here it is the one the pages are laid out by.
  container.style.width = atScale(text.upright.width);
  container.style.height = atScale(text.upright.height);
  return { done: layer.render(), cancel: () => layer.cancel() };
}
