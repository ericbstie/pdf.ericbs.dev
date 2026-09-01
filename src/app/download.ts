/** Path separators, control characters and the punctuation file systems reserve. */
const AWKWARD = /[\p{C}/\\:*?"<>|]/gu;

/** Long enough for any real title, short enough that no file system refuses the name. */
const MAX_STEM = 100;

/** Names Windows keeps for devices. It refuses them whatever extension follows. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** A name the browser will accept for the saved copy: no path, no control characters, always a PDF. */
export function downloadName(chosen: string): string {
  const stem = chosen
    .replace(/\.pdf$/i, "")
    .replace(AWKWARD, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .slice(0, MAX_STEM)
    // Windows will not take a trailing dot or space either, and slicing can leave one behind.
    .replace(/[.\s]+$/, "");
  if (stem === "") return "document.pdf";
  return RESERVED.test(stem) ? `${stem}_.pdf` : `${stem}.pdf`;
}

/** Browsers cancel a download whose blob has already been let go, so the URL outlives the click. */
const LET_DOWNLOAD_START = 60_000;

export function downloadFile(bytes: Uint8Array, name: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = downloadName(name);
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), LET_DOWNLOAD_START);
}
