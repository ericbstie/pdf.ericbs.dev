import { expect, test } from "bun:test";
import { downloadName } from "./download";

test("an ordinary name is kept as it is", () => {
  expect(downloadName("lease.pdf")).toBe("lease.pdf");
});

test("a name without the extension gains one", () => {
  expect(downloadName("lease")).toBe("lease.pdf");
});

test("the extension is not doubled, whatever its case", () => {
  expect(downloadName("lease.PDF")).toBe("lease.pdf");
});

test("a name carrying a path keeps only a name", () => {
  expect(downloadName("../../etc/passwd.pdf")).toBe("etc passwd.pdf");
});

test("a windows path is flattened too", () => {
  expect(downloadName("C:\\Users\\me\\lease.pdf")).toBe("C Users me lease.pdf");
});

test("control characters are stripped", () => {
  expect(downloadName("lease\r\n\u0000.pdf")).toBe("lease.pdf");
});

test("a name of nothing but punctuation still saves", () => {
  expect(downloadName("...")).toBe("document.pdf");
});

test("an empty name still saves", () => {
  expect(downloadName("")).toBe("document.pdf");
});

test("an overlong name is cut back and still ends in .pdf", () => {
  const saved = downloadName(`${"a".repeat(500)}.pdf`);
  expect(saved.length).toBeLessThanOrEqual(104);
  expect(saved.endsWith(".pdf")).toBe(true);
});

test("a name Windows keeps for a device is nudged aside", () => {
  expect(downloadName("CON.pdf")).toBe("CON_.pdf");
  expect(downloadName("nul")).toBe("nul_.pdf");
  expect(downloadName("LPT1.pdf")).toBe("LPT1_.pdf");
  expect(downloadName("com9")).toBe("com9_.pdf");
});

test("a name that merely starts like a device is left alone", () => {
  expect(downloadName("console notes.pdf")).toBe("console notes.pdf");
  expect(downloadName("com10.pdf")).toBe("com10.pdf");
});

test("a name is not left ending in a dot or a space", () => {
  expect(downloadName("lease. .pdf")).toBe("lease.pdf");
  expect(downloadName(`${"a".repeat(99)}. .pdf`)).toBe(`${"a".repeat(99)}.pdf`);
});
