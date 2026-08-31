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
