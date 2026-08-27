/**
 * Captures the app for design review.
 *
 * Requires the emulators seeded (npm run seed) and the dev server running against them:
 *   NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev
 *
 * Signs in once, then walks every route at desktop and phone width, in both themes. Entrance
 * transitions are disabled for the capture: an element still animating reads as a missing element
 * in a screenshot, and that gets "fixed" into a regression.
 *
 * Full-page shots are taken by GROWING THE VIEWPORT to the document height, not with Playwright's
 * `fullPage` stitching. Stitching re-renders per band and composites the results, and on this app it
 * painted fragments of the page body into the header strip — a review then reported a rendering
 * defect that did not exist. A single-pass capture cannot produce that artifact.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(repoRoot, ".impeccable", "review");
mkdirSync(OUT, { recursive: true });

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
const EMAIL = process.env.SEED_EMAIL ?? "demo@chronostep.local";
const PASSWORD = process.env.SEED_PASSWORD ?? "chronostep";

const ROUTES = [
  { path: "/", name: "oggi" },
  { path: "/tasks", name: "task" },
  { path: "/tasks/preventivo-rossi", name: "dettaglio" },
  { path: "/timeline", name: "timeline" },
  { path: "/report", name: "report" },
  { path: "/insights", name: "insights" },
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const NO_MOTION = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
`;

/** One-pass full-page capture: grow the viewport to the document, shoot, restore. */
const captureFullPage = async (page, width, height, path) => {
  const documentHeight = await page.evaluate(() =>
    Math.ceil(
      Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        document.documentElement.offsetHeight,
      ),
    ),
  );
  const tall = Math.min(Math.max(documentHeight, height), 12000);
  await page.setViewportSize({ width, height: tall });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(120);
  await page.screenshot({ path });
  await page.setViewportSize({ width, height });
};

const browser = await chromium.launch();
const captured = [];

for (const viewport of VIEWPORTS) {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
      locale: "it-IT",
      timezoneId: "Europe/Rome",
    });
    // Stamp the theme before the app boots, the same way the layout's bootstrap script would.
    await context.addInitScript((value) => {
      try {
        localStorage.setItem("chronostep.theme", value);
      } catch {}
    }, theme);

    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.addStyleTag({ content: NO_MOTION });
    // Either the auth wall or the app shell; whichever arrives, the boot is over.
    await page.waitForSelector('input[type="email"], nav', { timeout: 30000 });

    // Sign in. The auth wall is the first thing an unauthenticated visit renders.
    const emailField = page.locator('input[type="email"]');
    if (await emailField.count()) {
      if (viewport.name === "desktop" && theme === "light") {
        await captureFullPage(page, viewport.width, viewport.height, join(OUT, "accesso.png"));
        captured.push("accesso.png");
      }
      await emailField.fill(EMAIL);
      await page.locator('input[type="password"]').fill(PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page.waitForSelector("nav", { timeout: 20000 });
    }

    // One capture with a live session, so the running-session bar is reviewable from evidence
    // rather than from source. The session is STARTED THROUGH THE UI rather than forged in storage:
    // Firebase Auth persists to IndexedDB here, not localStorage, so a hand-written timer entry
    // carried no usable uid and was discarded on the next reconcile — and driving the real control
    // is better evidence anyway.
    if (viewport.name === "desktop" && theme === "light") {
      await page.goto(`${BASE}/tasks/preventivo-rossi`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("main h1", { timeout: 30000 });
      const start = page.getByRole("button", { name: /^Avvia/ }).first();
      if (await start.count()) {
        await start.click();
        await page.waitForTimeout(500);
        await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
        await page.addStyleTag({ content: NO_MOTION });
        await page.waitForSelector("main h1", { timeout: 30000 });
        await page.waitForTimeout(600);
        await captureFullPage(
          page,
          viewport.width,
          viewport.height,
          join(OUT, "oggi-sessione-in-corso.png"),
        );
        captured.push("oggi-sessione-in-corso.png");
        // Discard it: the other captures document the idle state.
        await page.evaluate(() => {
          try {
            localStorage.removeItem("chronostep.timer.v1");
          } catch {}
        });
        await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("main h1", { timeout: 30000 });
      }
    }

    for (const route of ROUTES) {
      await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded" });
      await page.addStyleTag({ content: NO_MOTION });
      await page.waitForSelector("main h1, main p", { timeout: 30000 });
      // The store hydrates after the first paint; capturing before it lands photographs a spinner.
      await page
        .waitForFunction(
          () => {
            const text = document.body.innerText;
            return !text.includes("Leggo i dati") && !text.includes("Leggo il task");
          },
          undefined,
          { timeout: 30000 },
        )
        .catch(() => {});
      await page.waitForTimeout(400);
      const file = `${route.name}-${viewport.name}-${theme}.png`;
      await captureFullPage(page, viewport.width, viewport.height, join(OUT, file));
      captured.push(file);

      // The finish review expects one file per inspected viewport under these exact names.
      if (route.path === "/" && theme === "light") {
        const canonical = `${viewport.name}.png`;
        await captureFullPage(page, viewport.width, viewport.height, join(OUT, canonical));
        captured.push(canonical);
      }
    }

    await context.close();
  }
}

await browser.close();
console.log(`  ${captured.length} catture in .impeccable/review/\n${captured.map((f) => `    ${f}`).join("\n")}`);
