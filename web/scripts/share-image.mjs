import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const regular = (
  await readFile(resolve(web, "src/assets/geist-regular.woff2"))
).toString("base64");
const bold = (
  await readFile(resolve(web, "src/assets/geist-semibold.woff2"))
).toString("base64");
const logo = await readFile(resolve(web, "public/favicon.svg"), "utf8");
const html = `<!doctype html><style>@font-face{font-family:Geist;src:url(data:font/woff2;base64,${regular});font-weight:400}@font-face{font-family:Geist;src:url(data:font/woff2;base64,${bold});font-weight:600}*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#FFF5E6;color:#2B2118;font-family:Geist;padding:60px;background-image:radial-gradient(#E9D9C3 1px,transparent 1px);background-size:20px 20px}.brand{display:flex;align-items:center;gap:14px;font-size:30px;font-weight:600}.brand svg{width:52px;height:52px}h1{font-size:110px;line-height:1;letter-spacing:-7px;margin:65px 0 28px;font-weight:600}h1 span{color:#E07A3E}p{font-size:30px;margin:0}footer{display:flex;justify-content:space-between;align-items:center;margin-top:60px;font-size:24px}.pill{padding:15px 30px;border:1px solid #2B2118;border-radius:99px;background:#FFB48A;box-shadow:0 5px #CA8A5F}</style><div class="brand">${logo} hamster hour</div><h1>Bet on the hamster<span>.</span></h1><p>A real hamster. One hour. How far will he go?</p><footer><span>hamsterhour.fun</span><span class="pill">Watch the wheel. Make your pick. ↗</span></footer>`;
const { chromium } = await import(
  pathToFileURL(
    process.env.IMD_PLAYWRIGHT ??
      "/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs",
  ).href
);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(web, "public/share.png") });
} finally {
  await browser.close();
}
console.log(
  "Generated 1200×630 public/share.png from the original vector mark and local fonts.",
);
