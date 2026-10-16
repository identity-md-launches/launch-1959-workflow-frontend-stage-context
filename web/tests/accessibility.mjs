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
  for (const tab of ["Bet", "Stake", "History"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    reports.push({
      view: tab,
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
  }
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  reports.push({
    view: "Wallet picker",
    violations: (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  });
  await page.screenshot({ path: resolve(out, "wallet-390.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Bet", exact: true }).click();
  await page.evaluate(() => (document.documentElement.style.fontSize = "32px"));
  reports.push({
    view: "200% text size at 390",
    horizontalOverflow: await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  });
  await page.screenshot({ path: resolve(out, "text-200.png"), fullPage: true });
  await page.evaluate(() => (document.documentElement.style.fontSize = "16px"));
  if (process.argv.includes("--render-share")) {
    await page.goto(url + "share.svg");
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.screenshot({ path: resolve(root, "web/public/share.png") });
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
