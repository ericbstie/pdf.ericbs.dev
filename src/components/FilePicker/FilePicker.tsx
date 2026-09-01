import type { RefObject } from "react";

/**
 * The browser's own file picker, kept off screen. The editor opens it from the toolbar through
 * the ref, and the empty page opens it by pointing a label at this id.
 */
export function FilePicker({ id, ref, onPick }: { id: string; ref: RefObject<HTMLInputElement | null>; onPick: (file: File | undefined) => void }) {
  return (
    <input
      ref={ref}
      id={id}
      type="file"
      accept="application/pdf,.pdf"
      aria-label="Open a PDF"
      className="sr-only"
      onChange={event => {
        const chosen = event.target.files?.[0];
        // Cleared so that picking the same file twice in a row still counts as a change.
        event.target.value = "";
        onPick(chosen);
      }}
    />
  );
}
