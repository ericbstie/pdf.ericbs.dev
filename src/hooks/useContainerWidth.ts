import { useEffect, useRef, useState } from "react";

/**
 * The width of the box the pages scroll inside, which is what a page is laid out to fit. Measured
 * rather than read from the window, so a scrollbar appearing counts as the room getting narrower.
 */
export function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}
