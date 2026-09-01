/** The one place the editor has to say something went wrong, and the only way to put it away. */
export function Notice({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <div role="alert" data-testid="notice" className="fixed inset-x-0 top-0 z-10 grid justify-items-center p-3">
      <p className="flex max-w-md items-center gap-3 rounded-xl bg-neutral-900/95 px-4 py-3 text-sm shadow-xl ring-1 ring-white/10">
        <span>{text}</span>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="grid size-8 shrink-0 place-items-center rounded-full text-neutral-400 touch-manipulation hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current stroke-[1.8] [stroke-linecap:round]" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </p>
    </div>
  );
}
