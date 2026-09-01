import { expect, test } from "bun:test";
import { keepEncodable } from "./text";

test("keeps plain and accented latin text", () => {
  expect(keepEncodable("Reçu — 12 €")).toBe("Reçu — 12 €");
});

test("drops what the page font cannot draw", () => {
  expect(keepEncodable("ok 🎉 好")).toBe("ok  ");
});
