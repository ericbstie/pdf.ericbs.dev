import type { Rect } from "./edits";

/** A rendered page as one luminance byte per pixel, row-major. */
export type Bitmap = { width: number; height: number; luminance: Uint8Array };

export type BoxSizeRange = { minPixels: number; maxPixels: number };

const DARK = 170;
const SQUARENESS = 0.25;
const OUTLINE_FILL = 0.6;
const EDGE_COVERAGE = 0.7;
const INTERIOR_INK = 0.08;

type Component = { bounds: Rect; size: number };

export function toBitmap(image: ImageData): Bitmap {
  const luminance = new Uint8Array(image.width * image.height);
  for (let pixel = 0; pixel < luminance.length; pixel += 1) {
    const at = pixel * 4;
    luminance[pixel] = (0.299 * image.data[at]! + 0.587 * image.data[at + 1]! + 0.114 * image.data[at + 2]!) | 0;
  }
  return { width: image.width, height: image.height, luminance };
}

function isDark(bitmap: Bitmap, x: number, y: number): boolean {
  return bitmap.luminance[y * bitmap.width + x]! < DARK;
}

function growComponent(bitmap: Bitmap, start: number, seen: Uint8Array): Component {
  const stack = [start];
  const bounds = { left: bitmap.width, top: bitmap.height, right: 0, bottom: 0 };
  let size = 0;
  seen[start] = 1;
  while (stack.length > 0) {
    const pixel = stack.pop()!;
    const x = pixel % bitmap.width;
    const y = (pixel - x) / bitmap.width;
    size += 1;
    bounds.left = Math.min(bounds.left, x);
    bounds.top = Math.min(bounds.top, y);
    bounds.right = Math.max(bounds.right, x);
    bounds.bottom = Math.max(bounds.bottom, y);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= bitmap.width || ny >= bitmap.height) continue;
        const neighbour = ny * bitmap.width + nx;
        if (seen[neighbour] || !isDark(bitmap, nx, ny)) continue;
        seen[neighbour] = 1;
        stack.push(neighbour);
      }
    }
  }
  return {
    size,
    bounds: {
      x: bounds.left,
      y: bounds.top,
      width: bounds.right - bounds.left + 1,
      height: bounds.bottom - bounds.top + 1,
    },
  };
}

function componentsOf(bitmap: Bitmap): Component[] {
  const seen = new Uint8Array(bitmap.width * bitmap.height);
  const found: Component[] = [];
  for (let pixel = 0; pixel < seen.length; pixel += 1) {
    if (seen[pixel] || bitmap.luminance[pixel]! >= DARK) continue;
    found.push(growComponent(bitmap, pixel, seen));
  }
  return found;
}

function isSquarish(bounds: Rect, size: BoxSizeRange): boolean {
  const longest = Math.max(bounds.width, bounds.height);
  const shortest = Math.min(bounds.width, bounds.height);
  if (shortest < size.minPixels || longest > size.maxPixels) return false;
  return (longest - shortest) / longest <= SQUARENESS;
}

function darkRatio(bitmap: Bitmap, area: Rect): number {
  let dark = 0;
  for (let y = area.y; y < area.y + area.height; y += 1) {
    for (let x = area.x; x < area.x + area.width; x += 1) {
      if (isDark(bitmap, x, y)) dark += 1;
    }
  }
  return dark / (area.width * area.height);
}

function edgesOf(bounds: Rect): Rect[] {
  const thickness = Math.max(1, Math.round(Math.min(bounds.width, bounds.height) * 0.12));
  return [
    { ...bounds, height: thickness },
    { ...bounds, y: bounds.y + bounds.height - thickness, height: thickness },
    { ...bounds, width: thickness },
    { ...bounds, x: bounds.x + bounds.width - thickness, width: thickness },
  ];
}

/** Cuts an edge band into the one-pixel steps that run along it. */
function stepsAlong(edge: Rect): Rect[] {
  const horizontal = edge.width >= edge.height;
  const count = horizontal ? edge.width : edge.height;
  return Array.from({ length: count }, (_, step) =>
    horizontal
      ? { x: edge.x + step, y: edge.y, width: 1, height: edge.height }
      : { x: edge.x, y: edge.y + step, width: edge.width, height: 1 },
  );
}

function edgeCoverage(bitmap: Bitmap, edge: Rect): number {
  const steps = stepsAlong(edge);
  return steps.filter(step => darkRatio(bitmap, step) > 0).length / steps.length;
}

function hasUnbrokenBorder(bitmap: Bitmap, bounds: Rect): boolean {
  return edgesOf(bounds).every(edge => edgeCoverage(bitmap, edge) >= EDGE_COVERAGE);
}

function interiorOf(bounds: Rect): Rect {
  const inset = Math.max(2, Math.round(Math.min(bounds.width, bounds.height) * 0.25));
  return {
    x: bounds.x + inset,
    y: bounds.y + inset,
    width: Math.max(1, bounds.width - inset * 2),
    height: Math.max(1, bounds.height - inset * 2),
  };
}

function isEmptyBox(bitmap: Bitmap, component: Component): boolean {
  const { bounds, size } = component;
  if (size / (bounds.width * bounds.height) > OUTLINE_FILL) return false;
  return hasUnbrokenBorder(bitmap, bounds) && darkRatio(bitmap, interiorOf(bounds)) <= INTERIOR_INK;
}

/** Square outlines with nothing inside them: the printed checkboxes waiting to be ticked. */
export function findCheckboxes(bitmap: Bitmap, size: BoxSizeRange): Rect[] {
  return componentsOf(bitmap)
    .filter(component => isSquarish(component.bounds, size))
    .filter(component => isEmptyBox(bitmap, component))
    .map(component => component.bounds);
}

export function toPagePoints(rect: Rect, pixelsPerPoint: number): Rect {
  return {
    x: rect.x / pixelsPerPoint,
    y: rect.y / pixelsPerPoint,
    width: rect.width / pixelsPerPoint,
    height: rect.height / pixelsPerPoint,
  };
}
