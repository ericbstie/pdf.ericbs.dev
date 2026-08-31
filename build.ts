#!/usr/bin/env bun
import plugin from "bun-plugin-tailwind";
import { rm } from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "dist");

/** Every HTML file under src is an entry point; Bun follows the scripts and styles from there. */
function entrypoints(): string[] {
  return [...new Bun.Glob("**.html").scanSync("src")].map(name => path.resolve("src", name));
}

function readable(bytes: number): string {
  const units = ["B", "KB", "MB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(1)} ${units[unit]}`;
}

await rm(OUT, { recursive: true, force: true });

const built = await Bun.build({
  entrypoints: entrypoints(),
  outdir: OUT,
  plugins: [plugin],
  minify: true,
  target: "browser",
  sourcemap: "linked",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});

if (!built.success) {
  for (const log of built.logs) console.error(log);
  process.exit(1);
}

for (const output of built.outputs) {
  console.log(`${path.relative(process.cwd(), output.path)}  ${readable(output.size)}`);
}
