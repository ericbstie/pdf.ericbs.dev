import type { Point } from "../../lib/edits";
import { midpointOf, spreadOf, wheelFactor } from "../../lib/zoom";

/** What a gesture has to say: how much bigger, about which point, and when it is finished. */
export type Zooming = {
  by: (factor: number, focus: Point) => void;
  /** The fingers have lifted, or the wheel has gone quiet. Painting again can wait for this. */
  over: () => void;
};

/** A wheel never says it has finished, so a pause in it stands in for the fingers lifting. */
const WHEEL_QUIET = 150;

/** Safari sends its own pinch events rather than a wheel, and measures them from where it began. */
type GestureEvent = Event & { scale: number; clientX: number; clientY: number };

function twoFingers(event: TouchEvent): readonly [Touch, Touch] | null {
  return event.touches.length === 2 ? [event.touches[0]!, event.touches[1]!] : null;
}

/**
 * Every way of asking for a closer look, on one element: ctrl and the wheel, a touchpad pinch —
 * which arrives as ctrl and the wheel, or as Safari's own gesture — and two fingers on the glass.
 *
 * Each of them is a zoom the browser would otherwise have taken for itself, and the browser's own
 * zoom is the wrong one here: it stretches whatever pixels have already been painted, and it
 * carries the toolbar off the bottom of the screen. So each is turned down, and answered by
 * laying the pages out larger and painting them again at the size they are now drawn.
 */
export function watchZoomGestures(element: HTMLElement, zooming: Zooming): () => void {
  /** How far apart the fingers were last seen, or nothing when no pinch is under way. */
  let spread: number | null = null;
  /** The last reading of a Safari gesture, to divide the next one by. */
  let gestured = 1;
  let quiet: ReturnType<typeof setTimeout> | undefined;

  const finish = () => {
    clearTimeout(quiet);
    zooming.over();
  };

  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zooming.by(wheelFactor(event), { x: event.clientX, y: event.clientY });
    clearTimeout(quiet);
    quiet = setTimeout(finish, WHEEL_QUIET);
  };

  const onTouchStart = (event: TouchEvent) => {
    const fingers = twoFingers(event);
    spread = fingers && spreadOf(...fingers);
  };

  const onTouchMove = (event: TouchEvent) => {
    const fingers = twoFingers(event);
    if (!fingers || spread === null) return;
    // Two fingers are a pinch rather than a scroll, and the browser is told so on every move.
    event.preventDefault();
    const spreading = spreadOf(...fingers);
    if (spread > 0) zooming.by(spreading / spread, midpointOf(...fingers));
    spread = spreading;
  };

  /** A finger lifting ends the pinch, and the one left behind goes back to scrolling. */
  const onTouchEnd = (event: TouchEvent) => {
    if (event.touches.length >= 2 || spread === null) return;
    spread = null;
    finish();
  };

  /** Safari's gesture, beginning and ending. Either way there is nothing for the browser to do. */
  const onGestureStart = (event: Event) => {
    event.preventDefault();
    gestured = 1;
  };

  const onGestureEnd = (event: Event) => {
    event.preventDefault();
    gestured = 1;
    // On a touch screen the fingers have already said so, and will say so again on lifting.
    if (spread === null) finish();
  };

  const onGestureChange = (event: Event) => {
    event.preventDefault();
    // On a touch screen Safari sends these alongside the touches; the fingers have it already.
    if (spread !== null) return;
    const gesture = event as GestureEvent;
    if (gestured > 0) zooming.by(gesture.scale / gestured, { x: gesture.clientX, y: gesture.clientY });
    gestured = gesture.scale;
  };

  const held = { passive: false } as const;
  element.addEventListener("wheel", onWheel, held);
  element.addEventListener("touchstart", onTouchStart, held);
  element.addEventListener("touchmove", onTouchMove, held);
  element.addEventListener("touchend", onTouchEnd);
  element.addEventListener("touchcancel", onTouchEnd);
  element.addEventListener("gesturestart", onGestureStart, held);
  element.addEventListener("gesturechange", onGestureChange, held);
  element.addEventListener("gestureend", onGestureEnd, held);
  return () => {
    clearTimeout(quiet);
    element.removeEventListener("wheel", onWheel);
    element.removeEventListener("touchstart", onTouchStart);
    element.removeEventListener("touchmove", onTouchMove);
    element.removeEventListener("touchend", onTouchEnd);
    element.removeEventListener("touchcancel", onTouchEnd);
    element.removeEventListener("gesturestart", onGestureStart);
    element.removeEventListener("gesturechange", onGestureChange);
    element.removeEventListener("gestureend", onGestureEnd);
  };
}
