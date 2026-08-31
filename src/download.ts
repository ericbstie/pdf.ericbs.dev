/** Path separators, control characters and the punctuation file systems reserve. */
const AWKWARD = /[\p{C}/\\:*?"<>|]/gu;

/** Long enough for any real title, short enough that no file system refuses the name. */
const MAX_STEM = 100;

/** A name the browser will accept for the saved copy: no path, no control characters, always a PDF. */
export function downloadName(chosen: string): string {
  const stem = chosen
    .replace(/\.pdf$/i, "")
    .replace(AWKWARD, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .trim()
    .slice(0, MAX_STEM)
    .trim();
  return `${stem === "" ? "document" : stem}.pdf`;
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
