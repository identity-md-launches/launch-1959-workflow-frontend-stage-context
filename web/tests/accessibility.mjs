import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = resolve(root, "test/scratch/accessibility");
await mkdir(out, { recursive: true });
const { chromium } = await import(
  pathToFileURL(
    process.env.IMD_PLAYWRIGHT ??
      "/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs",
  ).href
);
const types = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".ttf": "font/ttf",
};
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, "http://local").pathname);
    if (p.includes("..")) throw Error();
    const f = resolve(
      root,
      "dist",
      "." + p + (p.endsWith("/") ? "index.html" : ""),
    );
    res.setHeader(
      "Content-Type",
      types[extname(f)] ?? "application/octet-stream",
    );
    res.end(await readFile(f));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;
let browser;
const reports = [];
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(url);
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .waitFor();
  const audit = async (view) => {
    const result = await new AxeBuilder({ page })
      .exclude("iframe")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    reports.push({
      view,
      violations: result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    });
  };
  await page
    .getByRole("button", { name: "Start playing", exact: true })
    .waitFor();
  await audit("Intro overlay, reduced motion");
  reports.push({
    view: "Reduced motion video",
    paused: await page.locator("video").evaluate((v) => v.paused),
  });
  await page.keyboard.press("Escape");
  for (const name of ["Bet", "Stake", "History", "Settle", "TEAM"]) {
    if (name !== "Bet") {
      await page.locator(".more-menu summary").click();
      await page
        .locator(".more-popover")
        .getByRole("button", { name, exact: true })
        .click();
    }
    await audit(name);
  }
  await page.getByRole("button", { name: "Bet", exact: true }).click();
  await page.getByRole("button", { name: "Bet OVER", exact: true }).click();
  await audit("Amount sheet");
  await page.keyboard.press("Escape");
  reports.push({
    view: "Amount sheet keyboard return",
    focused: await page.evaluate(() =>
      document.activeElement.getAttribute("aria-label"),
    ),
  });
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await audit("Wallet picker");
  await page.screenshot({ path: resolve(out, "wallet-390.png") });
  await page.keyboard.press("Escape");
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    reports.push({
      view: `Reflow ${width}`,
      horizontalOverflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    });
  }
  console.log(JSON.stringify(reports));
  if (reports.some((r) => r.violations?.length || r.horizontalOverflow))
    process.exitCode = 1;
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await writeFile(
    resolve(out, "results.json"),
    JSON.stringify(reports, null, 2),
  );
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
}
