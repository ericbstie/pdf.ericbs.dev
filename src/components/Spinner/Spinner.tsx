/** Covers the page while a file is being read, which on a large PDF is a noticeable wait. */
export function Spinner() {
  return (
    <div role="status" aria-label="Loading PDF" className="fixed inset-0 z-20 grid place-items-center bg-neutral-900/60">
      <svg viewBox="0 0 24 24" className="size-16 animate-spin fill-none stroke-current stroke-[1.2]" aria-hidden="true">
        <circle cx="12" cy="12" r="9" className="opacity-25" />
        <path d="M21 12a9 9 0 0 0-9-9" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
