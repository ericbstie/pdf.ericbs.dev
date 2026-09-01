function OpenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-16 fill-none stroke-current stroke-[1.2] [stroke-linecap:round] [stroke-linejoin:round]" aria-hidden="true">
      <path d="M12 3v9m0 0l-3.5-3.5M12 12l3.5-3.5" />
      <path d="M4 15v3a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-3" />
    </svg>
  );
}

/**
 * What the editor shows with nothing open. It is a label rather than a button so that the whole
 * square opens the picker the browser already owns; the drop it also answers to is the page's.
 */
export function OpenPrompt({ pickerId, dragging }: { pickerId: string; dragging: boolean }) {
  return (
    <label htmlFor={pickerId} className="grid h-full cursor-pointer place-items-center">
      <span
        className={`grid size-48 place-items-center rounded-3xl border-2 border-dashed transition-colors ${
          dragging ? "border-neutral-200 text-neutral-100" : "border-neutral-600 text-neutral-500 hover:border-neutral-400 hover:text-neutral-300"
        }`}
      >
        <OpenIcon />
      </span>
    </label>
  );
}
