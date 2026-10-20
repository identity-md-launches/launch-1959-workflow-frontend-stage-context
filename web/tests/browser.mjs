import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeAbiParameters,
  encodeEventTopics,
  erc20Abi,
  keccak256,
  getAbiItem,
  toHex,
} from "viem";
const web = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  root = resolve(web, ".."),
  dist = resolve(root, "dist"),
  out = resolve(root, "test/scratch/browser-polish");
await mkdir(out, { recursive: true });
const { chromium, webkit } = await import(
  pathToFileURL(
    process.env.IMD_PLAYWRIGHT ??
      "/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs",
  ).href
);
const abi = JSON.parse(
  await readFile(resolve(dist, "abi/HamsterHour.json"), "utf8"),
);
const config = JSON.parse(
  await readFile(resolve(dist, "imd-deployment.json"), "utf8"),
);
const game = config.contracts[0].address,
  token = config.network.pairToken.address;
const account = "0x1111111111111111111111111111111111111111",
  other = "0x2222222222222222222222222222222222222222";
const GENESIS = 1791847200n,
  NOW = BigInt(Math.floor(new Date("2026-10-20T07:00:00Z").getTime() / 1000)),
  current = (NOW - GENESIS) / 3600n,
  next = current + 1n,
  W = 10n ** 18n;
const fixtureCode = "0x6001600055";
config.contracts[0].runtimeCodeHash = keccak256(fixtureCode);
config.contracts[0].deploymentBlock = "1000";
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".md": "text/markdown",
  ".zip": "application/zip",
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://local").pathname,
    );
    if (!pathname.startsWith("/preview/")) throw Error();
    const path = resolve(dist, pathname.slice(9) || "index.html");
    if (!path.startsWith(dist + "/")) throw Error();
    res.writeHead(200, {
      "content-type": types[extname(path)] ?? "application/octet-stream",
    });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const browser = await (
  process.env.HH_BROWSER === "webkit" ? webkit : chromium
).launch({ headless: true });
const results = [],
  errors = [];
let state;
function reset() {
  state = {
    allowance: 0n,
    balance: 1000n * W,
    position: new Map(),
    claimable: new Map([
      [String(current - 1n), 8n * W],
      [String(current - 2n), 7n * W],
    ]),
    txs: [],
    hashes: new Map(),
    logs: [],
    running: false,
    reject: false,
    revert: false,
    badCode: false,
    statusFailure: false,
    statsFailure: false,
    liveState: "live",
    liveFailure: false,
    expiredLive: false,
  };
  addLog(
    "BinaryBet",
    { k: current - 1n, bettor: account, market: 0, side: true, amount: 5n * W },
    1001n,
  );
  addLog(
    "BinaryBet",
    { k: current - 2n, bettor: account, market: 1, side: true, amount: 5n * W },
    1002n,
  );
  addLog("Fed", { from: other, amount: 3n * W }, 1003n);
  addLog(
    "TicketBought",
    { k: current - 1n, bettor: other, guess: 2300n },
    1004n,
  );
  addLog(
    "JackpotFinalized",
    {
      k: current - 1n,
      pot: 100n * W,
      winners: 1n,
      share: 80n * W,
      carried: 20n * W,
    },
    1005n,
  );
}
function addLog(eventName, args, block) {
  const item = getAbiItem({ abi, name: eventName });
  const data = encodeAbiParameters(
    item.inputs.filter((x) => !x.indexed),
    item.inputs.filter((x) => !x.indexed).map((x) => args[x.name]),
  );
  const i = state.logs.length;
  const log = {
    address: game,
    topics: encodeEventTopics({ abi, eventName, args }),
    data,
    blockNumber: toHex(block),
    blockHash: "0x" + "b".repeat(64),
    transactionHash: "0x" + String(i + 100).padStart(64, "0"),
    transactionIndex: "0x0",
    logIndex: toHex(i),
    removed: false,
  };
  state.logs.push(log);
}
const basePosition = () => ({
  over: 0n,
  under: 0n,
  yes: 0n,
  no: 0n,
  guess: 0n,
  hasTicket: false,
  jackpotPaid: false,
  paid: 0n,
});
function position(k) {
  if (state.position.has(String(k))) return state.position.get(String(k));
  if (k === current - 1n) return { ...basePosition(), over: 5n * W };
  if (k === current - 2n) return { ...basePosition(), yes: 5n * W };
  return basePosition();
}
function windowInfo(k) {
  return {
    index: k,
    status: k < current - 2n ? 0 : k < current ? 2 : 1,
    startsAt: GENESIS + k * 3600n,
    endsAt: GENESIS + (k + 1n) * 3600n,
    closesAt: GENESIS + k * 3600n,
    timeoutAt: GENESIS + (k + 1n) * 3600n + 172800n,
    line: 2100n,
    result: k < current ? 2300n : 0n,
    over: k < current - 2n ? 0n : 10n * W,
    under: k < current - 2n ? 0n : 10n * W,
    yes: k < current - 2n ? 0n : 2n * W,
    no: k < current - 2n ? 0n : 8n * W,
    tickets: 0n,
    ouVoid: false,
    snVoid: false,
    feesAllocated: true,
    jackpotFinalized: k < current,
    jackpotPot: k < current ? 100n * W : 0n,
    jackpotWinners: k < current ? 1n : 0n,
    jackpotShare: k < current ? 80n * W : 0n,
    pendingJackpotDeposits: 3n * W,
    oracleRequested: false,
    oracleRequestPending: false,
    publicSettleHeld: false,
    intakeRequestId: "0x" + "0".repeat(64),
    requestId: "0x" + "0".repeat(64),
  };
}
function block() {
  return {
    number: "0xbb8",
    hash: "0x" + "b".repeat(64),
    parentHash: "0x" + "a".repeat(64),
    nonce: "0x0000000000000000",
    sha3Uncles: "0x" + "0".repeat(64),
    logsBloom: "0x" + "0".repeat(512),
    transactionsRoot: "0x" + "0".repeat(64),
    stateRoot: "0x" + "0".repeat(64),
    receiptsRoot: "0x" + "0".repeat(64),
    miner: other,
    difficulty: "0x0",
    totalDifficulty: "0x0",
    extraData: "0x",
    size: "0x200",
    gasLimit: "0x1c9c380",
    gasUsed: "0x10000",
    timestamp: toHex(NOW),
    transactions: [],
    uncles: [],
    baseFeePerGas: "0x3b9aca00",
    mixHash: "0x" + "0".repeat(64),
  };
}
function rpc(method, params) {
  if (method === "eth_chainId") return "0x1";
  if (method === "eth_blockNumber") return "0xbb8";
  if (method === "eth_getBlockByNumber" || method === "eth_getBlockByHash")
    return block();
  if (method === "eth_getCode") return state.badCode ? "0x6000" : fixtureCode;
  if (method === "eth_getBalance") return toHex(100n * W);
  if (method === "eth_gasPrice") return "0x3b9aca00";
  if (method === "eth_estimateGas") return "0x30d40";
  if (method === "eth_getTransactionCount") return "0x1";
  if (method === "eth_getLogs") {
    const from = BigInt(params[0].fromBlock ?? "0x0"),
      to =
        params[0].toBlock === "latest"
          ? 3000n
          : BigInt(params[0].toBlock ?? 3000);
    return state.logs.filter(
      (x) => BigInt(x.blockNumber) >= from && BigInt(x.blockNumber) <= to,
    );
  }
  if (method === "eth_getTransactionReceipt") {
    const t = state.hashes.get(params[0]);
    if (!t) return null;
    return {
      transactionHash: params[0],
      transactionIndex: "0x0",
      blockHash: block().hash,
      blockNumber: "0xbb8",
      from: account,
      to: t.to,
      cumulativeGasUsed: "0x30d40",
      gasUsed: "0x30d40",
      contractAddress: null,
      logs: [],
      logsBloom: "0x" + "0".repeat(512),
      status: t.revert ? "0x0" : "0x1",
      effectiveGasPrice: "0x3b9aca00",
      type: "0x2",
    };
  }
  if (method === "eth_call") {
    const call = params[0];
    const isToken = call.to.toLowerCase() === token.toLowerCase();
    const d = decodeFunctionData({
      abi: isToken ? erc20Abi : abi,
      data: call.data,
    });
    let result;
    const fn = d.functionName,
      k = d.args?.[0];
    if (isToken) {
      result =
        fn === "balanceOf"
          ? state.balance
          : fn === "allowance"
            ? state.allowance
            : fn === "decimals"
              ? 18
              : fn === "symbol"
                ? "IMD"
                : fn === "approve"
                  ? true
                  : undefined;
    } else {
      const globals = {
        IMD: token,
        GENESIS,
        currentWindow: current,
        earliestNotStartedWindow: next,
        line: 2100n,
        jackpotSeed: 125n * W,
        jackpotInFlight: 3n * W,
        jackpotOutstanding: 80n * W,
        nextFinalizeWindow: current,
        totalPendingJackpotDeposits: 3n * W,
      };
      result =
        fn in globals
          ? globals[fn]
          : fn === "windowInfo"
            ? windowInfo(k)
            : fn === "isBettingOpen"
              ? GENESIS + k * 3600n > NOW
              : fn === "position"
                ? position(k)
                : fn === "claimable"
                  ? (state.claimable.get(String(k)) ?? 0n)
                  : fn === "lossOf"
                    ? 0n
                    : undefined;
    }
    return encodeFunctionResult({
      abi: isToken ? erc20Abi : abi,
      functionName: fn,
      result,
    });
  }
  throw Error(`Unhandled RPC method ${method}`);
}
async function sendTransaction(tx) {
  if (state.reject) {
    state.reject = false;
    throw { code: 4001, message: "User rejected" };
  }
  const tokenTx = tx.to.toLowerCase() === token.toLowerCase();
  const d = decodeFunctionData({
    abi: tokenTx ? erc20Abi : abi,
    data: tx.data,
  });
  const record = {
    to: tx.to,
    fn: d.functionName,
    args: d.args,
    from: tx.from,
    revert: state.revert,
  };
  state.revert = false;
  state.txs.push(record);
  const hash = "0x" + String(state.txs.length + 500).padStart(64, "0");
  state.hashes.set(hash, record);
  if (!record.revert) {
    if (d.functionName === "approve") {
      assert.equal(d.args[0].toLowerCase(), game.toLowerCase());
      state.allowance = d.args[1];
    } else if (
      d.functionName === "betOverUnder" ||
      d.functionName === "betSnooze"
    ) {
      const [k, side, amount] = d.args;
      assert.ok(state.allowance >= amount);
      state.allowance -= amount;
      state.balance -= amount;
      const p = position(k);
      p[
        d.functionName === "betOverUnder"
          ? side
            ? "over"
            : "under"
          : side
            ? "yes"
            : "no"
      ] += amount;
      state.position.set(String(k), p);
      addLog(
        "BinaryBet",
        {
          k,
          bettor: account,
          market: d.functionName === "betOverUnder" ? 0 : 1,
          side,
          amount,
        },
        3000n,
      );
    } else if (d.functionName === "claim") {
      const k = d.args[0],
        amount = state.claimable.get(String(k)) ?? 0n;
      state.claimable.set(String(k), 0n);
      state.balance += amount;
      const p = position(k);
      p.paid += amount;
      state.position.set(String(k), p);
      addLog("Claimed", { k, account, amount }, 3000n);
    } else if (d.functionName === "buyTicket") {
      const [k, guess] = d.args;
      state.allowance -= 5n * W;
      state.balance -= 5n * W;
      const p = position(k);
      p.hasTicket = true;
      p.guess = guess;
      state.position.set(String(k), p);
      addLog("TicketBought", { k, bettor: account, guess }, 3000n);
    } else if (d.functionName === "feedHamster") {
      state.allowance -= d.args[0];
      state.balance -= d.args[0];
      addLog("Fed", { from: account, amount: d.args[0] }, 3000n);
    }
  }
  return hash;
}
async function pageFor({
  width = 1440,
  connected = false,
  mobile = false,
  codeMismatch = false,
  statsFailure = false,
  liveState = "live",
  locale = "en-US",
} = {}) {
  reset();
  state.badCode = codeMismatch;
  state.statsFailure = statsFailure;
  state.liveState = liveState;
  const context = await browser.newContext({
    viewport: { width, height: width < 600 ? 844 : 1000 },
    locale,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: "reduce",
    ...(mobile
      ? {
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
        }
      : {}),
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.url().startsWith(url) && r.status() >= 400)
      errors.push(`Local resource ${r.status()}: ${new URL(r.url()).pathname}`);
  });
  page.setDefaultTimeout(12000);
  await page.clock.install({ time: new Date(Number(NOW) * 1000) });
  await page.exposeFunction("hhWalletRequest", async ({ method, params }) => {
    if (["eth_accounts", "eth_requestAccounts"].includes(method))
      return [account];
    if (method === "eth_chainId") return "0x1";
    if (method === "wallet_requestPermissions")
      return [{ parentCapability: "eth_accounts" }];
    if (method === "wallet_getPermissions")
      return [{ parentCapability: "eth_accounts" }];
    if (method === "eth_sendTransaction") return sendTransaction(params[0]);
    if (method === "personal_sign") return "0x" + "1".repeat(130);
    if (
      method === "wallet_switchEthereumChain" ||
      method === "wallet_addEthereumChain"
    )
      return null;
    return rpc(method, params);
  });
  if (!mobile)
    await page.addInitScript(() => {
      const listeners = {};
      const p = {
        isMetaMask: true,
        request: async (a) => {
          try {
            return await window.hhWalletRequest(a);
          } catch (e) {
            if (String(e?.message).includes("User rejected"))
              throw { code: 4001, message: "User rejected" };
            throw e;
          }
        },
        on: (n, fn) => {
          listeners[n] = fn;
        },
        removeListener: () => {},
      };
      window.ethereum = p;
      const announce = () =>
        dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: {
              info: {
                uuid: "11111111-1111-4111-8111-111111111111",
                name: "Test Browser Wallet",
                icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',
                rdns: "test.wallet",
              },
              provider: p,
            },
          }),
        );
      addEventListener("eip6963:requestProvider", announce);
      announce();
    });
  await page.route("**/*", async (route) => {
    const req = route.request(),
      u = new URL(req.url());
    if (u.pathname.endsWith("/imd-deployment.json"))
      return route.fulfill({ json: config });
    if (config.network.rpcUrls.some((x) => req.url().startsWith(x))) {
      try {
        const payload = req.postDataJSON();
        const one = (x) => ({
          jsonrpc: "2.0",
          id: x.id,
          result: rpc(x.method, x.params ?? []),
        });
        return route.fulfill({
          json: Array.isArray(payload) ? payload.map(one) : one(payload),
        });
      } catch (e) {
        console.error("FIXTURE RPC ERROR", String(e));
        return route.fulfill({
          json: {
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32000, message: String(e) },
          },
        });
      }
    }
    if (u.host === "hamster-hour.hamsterhour562.workers.dev") {
      if (u.pathname === "/status")
        return route.fulfill({
          status: state.statusFailure ? 503 : 200,
          json: {
            measurement: {
              freshness: "online",
              observedAt: new Date(Number(NOW) * 1000).toISOString(),
              speedMmPerSecond: state.running ? 100 : 0,
              cumulativeWorkUnits: "100123",
            },
          },
        });
      if (u.pathname === "/rounds") {
        const first = (GENESIS + current * 3600n - 1791847800n) / 600n + 1n;
        return route.fulfill({
          json: {
            recentSettlements: [
              {
                previousSettledThroughRound: String(first - 2n),
                settledThroughRound: String(first - 1n),
                cumulativeWork: "100000",
                workAdded: "20",
              },
            ],
          },
        });
      }
      if (u.pathname === "/live")
        return route.fulfill({
          status: state.liveFailure ? 503 : 200,
          json: {
            state: state.liveState,
            observedAt: new Date(Number(NOW) * 1000).toISOString(),
            validUntil: new Date(
              Number(NOW) * 1000 + (state.expiredLive ? -1000 : 120000),
            ).toISOString(),
            playback: { kind: "youtube", publicId: "BWkC7PAYORA" },
          },
        });
      if (u.pathname.startsWith("/stats"))
        return state.statsFailure
          ? route.fulfill({ status: 404, json: { error: "not found" } })
          : route.fulfill({
              contentType: "application/json",
              body: await readFile(
                resolve(dist, `telemetry/${u.pathname.slice(1)}.json`),
                "utf8",
              ),
            });
      if (u.pathname === "/chat") {
        if (req.method() === "POST") {
          const b = req.postDataJSON();
          assert.equal(b.address.toLowerCase(), account);
          assert.ok(b.signature);
          return route.fulfill({
            json: {
              message: {
                id: "posted",
                address: account,
                message: b.message,
                ts: b.ts,
              },
              now: Number(NOW) * 1000,
            },
          });
        }
        return route.fulfill({
          json: {
            messages: [
              {
                id: "hello",
                address: other,
                message: "Go little guy!",
                ts: Number(NOW) * 1000,
              },
            ],
            now: Number(NOW) * 1000,
          },
        });
      }
    }
    if (u.origin === new URL(url).origin) return route.continue();
    if (u.hostname.includes("youtube.com"))
      return route.fulfill({
        contentType: "text/html",
        body: '<body style="background:#17141F;color:#FFF5E6">Wheel cam test fixture</body>',
      });
    return route.abort();
  });
  await page.goto(url);
  await page.getByRole("heading", { name: "Bet on the hamster." }).waitFor();
  await page
    .locator(".line-display .pixel")
    .filter({ hasText: "2,100" })
    .waitFor();
  await page.waitForTimeout(120);
  if (connected) {
    if (!(await page.locator(".account-menu").count()))
      await page.locator(".wallet-button").first().click();
    await page.locator(".account-menu").waitFor();
  }
  return { page, context };
}
async function check(name, fn) {
  if (process.env.HH_TEST && !name.includes(process.env.HH_TEST)) return;
  try {
    await fn();
    results.push({ name, passed: true });
    console.log("PASS", name);
  } catch (e) {
    for (const c of browser.contexts())
      for (const p of c.pages()) {
        await p
          .screenshot({ path: resolve(out, `failure-${results.length}.png`) })
          .catch(() => {});
        await writeFile(
          resolve(out, `failure-${results.length}.html`),
          await p.content(),
        ).catch(() => {});
      }
    results.push({ name, passed: false, error: String(e.stack ?? e) });
    console.error("FAIL", name, String(e));
  }
}
try {
  await check(
    "390px first screen, reflow, local fonts, theme, onboarding, keyboard help",
    async () => {
      const { page, context } = await pageFor({ width: 390 });
      const geometry = await page.evaluate(() => ({
        scrollTop: document.querySelector(".site").scrollTop,
        heading: document.querySelector("h1").getBoundingClientRect().toJSON(),
        header: document
          .querySelector("header")
          .getBoundingClientRect()
          .toJSON(),
        habitat: document
          .querySelector(".habitat")
          .getBoundingClientRect()
          .toJSON(),
        panel: document
          .querySelector(".bet-panel")
          .getBoundingClientRect()
          .toJSON(),
        side: document.querySelector(".sides").getBoundingClientRect().toJSON(),
        bar: document
          .querySelector(".bet-submit")
          .getBoundingClientRect()
          .toJSON(),
        overflow: document.documentElement.scrollWidth > innerWidth,
      }));
      assert.equal(geometry.overflow, false);
      assert.ok(
        geometry.side.bottom < geometry.bar.top,
        "All three choices should appear above the primary action",
      );
      assert.ok(
        geometry.bar.bottom <= 780,
        `Primary action is below the fold: ${geometry.bar.bottom}`,
      );
      assert.ok(
        geometry.habitat.bottom < geometry.panel.top,
        "The frame precedes the bet panel on mobile",
      );
      assert.ok(await page.locator(".habitat iframe").count());
      assert.ok(
        (await page.locator(".habitat iframe").getAttribute("src")).includes(
          "autoplay=0",
        ),
      );
      assert.equal(
        await page
          .locator(
            "#main .results, #main .activity, #main .agents-section, #main .my-bets, #main .camera, #main .fed-list, #main .mining-teaser",
          )
          .count(),
        0,
      );
      await page.screenshot({ path: resolve(out, "390-play.png") });
      await page.screenshot({
        path: resolve(out, "390-play.jpg"),
        quality: 75,
      });
      await page.getByRole("button", { name: "Switch to night theme" }).click();
      assert.equal(
        await page.locator("html").getAttribute("data-theme"),
        "night",
      );
      await page.screenshot({ path: resolve(out, "390-night.png") });
      await page.getByRole("button", { name: "Switch to day theme" }).click();
      await page.getByRole("button", { name: "New here? 1/3" }).click();
      await page.getByRole("button", { name: "Next step" }).click();
      await page.getByRole("button", { name: "Next step" }).click();
      await page.getByRole("button", { name: "Got it, let’s play" }).click();
      assert.equal(
        await page.evaluate(() => localStorage.getItem("hh-v2-intro")),
        "done",
      );
      await page.reload();
      await page
        .getByRole("button", { name: "New here?", exact: false })
        .waitFor();
      await page.locator('summary[aria-label="About Make your pick"]').click();
      await page
        .getByText("Bets close at the start of the hour.", { exact: false })
        .waitFor();
      await page.screenshot({ path: resolve(out, "390-help.png") });
      const loaded = await page.evaluate(async () => {
        await document.fonts.ready;
        return {
          geist: document.fonts.check("16px Geist"),
          pixel: document.fonts.check("16px Silkscreen"),
        };
      });
      assert.ok(loaded.geist && loaded.pixel);
      await context.close();
    },
  );
  await check(
    "exact approval, review, rejected signature, confirmed v2 bet, PNG share",
    async () => {
      const { page, context } = await pageFor({ connected: true });
      await page.getByRole("button", { name: "10", exact: true }).click();
      await page.getByRole("button", { name: "UNDER At or below" }).click();
      await page
        .locator("#bet-form")
        .getByRole("button", { name: "Approve IMD", exact: true })
        .click();
      await page
        .locator("#bet-form")
        .getByRole("button", { name: "Bet 10 IMD" })
        .waitFor();
      assert.equal(state.txs.length, 1);
      assert.equal(state.txs[0].fn, "approve");
      assert.equal(state.txs[0].args[1], 10n * W);
      await page
        .locator("#bet-form")
        .getByRole("button", { name: "Bet 10 IMD" })
        .click();
      const review = page.getByRole("dialog", { name: "Review your bet" });
      await review.waitFor();
      assert.equal(state.txs.length, 1);
      state.reject = true;
      await review.getByRole("button", { name: "Place 10 IMD bet" }).click();
      await review
        .locator(".error")
        .filter({ hasText: /declined|complete/ })
        .waitFor();
      assert.equal(state.txs.length, 1);
      await review.getByRole("button", { name: "Place 10 IMD bet" }).click();
      await page
        .getByRole("dialog", { name: "You’re in. Tell the wheel." })
        .waitFor();
      assert.equal(state.txs.at(-1).fn, "betOverUnder");
      assert.deepEqual(state.txs.at(-1).args, [next, false, 10n * W]);
      assert.equal(state.txs.at(-1).to.toLowerCase(), game.toLowerCase());
      const download = page.waitForEvent("download");
      await page.getByRole("link", { name: "Save image" }).click();
      const file = await download;
      await file.saveAs(resolve(out, "bet-share.png"));
      assert.ok((await readFile(resolve(out, "bet-share.png"))).length > 5000);
      await page.screenshot({ path: resolve(out, "1440-bet-share.png") });
      await context.close();
    },
  );
  await check(
    "ticket and feed use exact IMD approvals and v2 calls",
    async () => {
      const { page, context } = await pageFor({ connected: true });
      await page
        .getByRole("button", { name: "Guess the exact number · 5 IMD" })
        .click();
      const ticket = page.getByRole("dialog", {
        name: "Make your lucky guess",
      });
      await ticket.getByLabel("Your guess, in passes").fill("2210");
      await ticket.getByRole("button", { name: "Approve 5 IMD" }).click();
      await ticket.getByRole("button", { name: "Buy ticket · 5 IMD" }).click();
      await ticket.waitFor({ state: "hidden" });
      assert.deepEqual(state.txs.at(-1).args, [next, 2210n]);
      assert.equal(state.txs.at(-1).fn, "buyTicket");
      await page.getByRole("link", { name: "Jackpot", exact: true }).click();
      await page.getByRole("button", { name: "Feed the hamster" }).click();
      const feed = page.getByRole("dialog", { name: "Feed the hamster" });
      await feed.getByLabel("Amount in IMD").fill("2.5");
      await feed.getByRole("button", { name: "Approve 2.5 IMD" }).click();
      await feed.getByRole("button", { name: "Donate 2.5 IMD" }).click();
      await feed.waitFor({ state: "hidden" });
      assert.equal(state.txs.at(-1).fn, "feedHamster");
      assert.equal(state.txs.at(-1).args[0], (25n * W) / 10n);
      await context.close();
    },
  );
  await check(
    "My bets discovers indexed wallet bets and claims all payable hours sequentially",
    async () => {
      const { page, context } = await pageFor({ connected: true });
      await page.getByRole("link", { name: "My bets", exact: true }).click();
      await page.getByText("15 IMD", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: "Claim all", exact: true })
        .click();
      await page.getByText("2 hours claimed.", { exact: true }).waitFor();
      assert.deepEqual(
        state.txs.filter((t) => t.fn === "claim").map((t) => String(t.args[0])),
        [String(current - 1n), String(current - 2n)],
      );
      assert.ok(
        await page.getByRole("button", { name: "Claim all" }).isDisabled(),
      );
      await page.screenshot({ path: resolve(out, "1440-my-bets.png") });
      await context.close();
    },
  );
  await check(
    "stats ranges, dated fallback, chat signed message, cam pause, upcoming hour",
    async () => {
      const { page, context } = await pageFor({
        connected: true,
        statsFailure: true,
      });
      await page.getByRole("link", { name: "Stats", exact: true }).click();
      await page
        .getByText("Saved telemetry · refresh unavailable", { exact: false })
        .waitFor();
      await page.getByRole("button", { name: "30 days", exact: true }).click();
      await page
        .getByText("Observed 30-day averages", { exact: false })
        .waitFor();
      await page.screenshot({ path: resolve(out, "1440-stats.png") });
      await page.getByRole("link", { name: "The wheel", exact: true }).click();
      await page
        .getByLabel("Pick another hour")
        .selectOption(String(next + 1n));
      await page
        .getByText(
          `Bets for ${new Date(Number(GENESIS + (next + 1n) * 3600n) * 1000).toISOString().slice(11, 16)}`,
          { exact: false },
        )
        .waitFor();
      await page.getByRole("button", { name: "Open wheel chat" }).click();
      await page.getByLabel("Message", { exact: true }).fill("A tiny champion");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await page.getByText("A tiny champion", { exact: true }).waitFor();
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "Pause video", exact: true })
        .click();
      assert.equal(await page.locator("iframe").count(), 0);
      await page.getByRole("button", { name: "Watch live" }).click();
      assert.equal(await page.locator("iframe").count(), 1);
      await context.close();
    },
  );
  await check(
    "live speed drives night theme, stale/error telemetry does not pretend running, reduced motion",
    async () => {
      const { page, context } = await pageFor();
      state.running = true;
      state.liveState = "offline";
      await page.clock.fastForward(21000);
      await page.waitForFunction(
        () => document.documentElement.dataset.theme === "night",
      );
      assert.ok(await page.locator(".pixel-cage.running").count());
      assert.equal(
        await page.evaluate(
          () =>
            document.getAnimations().filter((x) => x.playState === "running")
              .length,
        ),
        0,
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
      assert.ok(
        await page.evaluate(() =>
          document.getAnimations().some((x) => x.playState === "running"),
        ),
      );
      await page.screenshot({ path: resolve(out, "1440-running.png") });
      await page
        .getByRole("button", { name: "Pause animations", exact: true })
        .click();
      assert.equal(
        await page.evaluate(
          () =>
            document
              .getAnimations()
              .filter(
                (x) =>
                  x.playState === "running" &&
                  x.effect?.getTiming().iterations === Infinity,
              ).length,
        ),
        0,
      );
      state.statusFailure = true;
      await page.clock.fastForward(41000);
      await page.waitForFunction(
        () => document.documentElement.dataset.theme === "day",
      );
      await context.close();
    },
  );
  await check(
    "contract bytecode mismatch blocks transaction before wallet send",
    async () => {
      const { page, context } = await pageFor({
        connected: true,
        codeMismatch: true,
      });
      await page
        .locator("#bet-form")
        .getByRole("button", { name: "Approve IMD", exact: true })
        .click();
      await page
        .locator(".bet-panel")
        .getByText("Live contract verification failed.", { exact: false })
        .waitFor();
      assert.equal(state.txs.length, 0);
      await context.close();
    },
  );
  await check(
    "reverted approval receipt restores the approval button and links failed receipt",
    async () => {
      const { page, context } = await pageFor({ connected: true });
      state.revert = true;
      await page
        .locator("#bet-form")
        .getByRole("button", { name: "Approve IMD", exact: true })
        .click();
      await page
        .locator(".bet-panel")
        .getByText("The transaction reverted.", { exact: false })
        .waitFor();
      assert.equal(state.allowance, 0n);
      assert.ok(
        await page
          .locator("#bet-form")
          .getByRole("button", { name: "Approve IMD", exact: true })
          .isEnabled(),
      );
      assert.ok(
        await page
          .locator(".bet-panel")
          .getByRole("link", { name: "View transaction" })
          .getAttribute("href"),
      );
      await context.close();
    },
  );
  await check(
    "mobile wallet picker offers four wallet browsers and Coinbase Smart Wallet",
    async () => {
      const { page, context } = await pageFor({ width: 390, mobile: true });
      await page.locator(".wallet-button").click();
      const picker = page.getByRole("dialog", { name: "Connect a wallet" });
      await picker.waitFor();
      for (const n of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
        assert.ok(
          await picker.getByRole("link", { name: `Open in ${n}` }).count(),
        );
      assert.ok(
        await picker
          .getByRole("button", { name: "Coinbase Smart Wallet" })
          .count(),
      );
      await page.keyboard.press("Escape");
      assert.equal(await picker.isVisible(), false);
      await context.close();
    },
  );
  await check(
    "all tabs, direct hashes, chat drawer on every tab, and comma formatting in a French browser",
    async () => {
      const { page, context } = await pageFor({
        width: 390,
        locale: "fr-FR",
        liveState: "offline",
      });
      assert.ok(
        await page
          .locator(".line-display .pixel")
          .innerText()
          .then((t) => t.includes("2,100")),
      );
      for (const tab of [
        "Jackpot",
        "Stats",
        "My bets",
        "Agents",
        "The wheel",
      ]) {
        await page.getByRole("link", { name: tab, exact: true }).click();
        await page.getByRole("button", { name: "Open wheel chat" }).click();
        const drawer = page.getByRole("dialog", {
          name: "Wheel chat",
          exact: true,
        });
        await drawer.waitFor();
        await drawer.getByText("Go little guy!", { exact: true }).waitFor();
        await page.keyboard.press("Escape");
        assert.equal(await drawer.count(), 0);
        assert.equal(
          await page.evaluate(() =>
            document.activeElement?.getAttribute("aria-label"),
          ),
          "Open wheel chat",
        );
      }
      await page.getByRole("link", { name: "Stats", exact: true }).click();
      await page.locator(".result-item").first().waitFor();
      const ended = await page
        .locator(".result-item")
        .evaluateAll((es) => es.map((e) => Number(e.dataset.endedAt)));
      assert.equal(ended.length, 24);
      assert.ok(
        ended.every((t, i) => t <= Number(NOW) && (!i || t < ended[i - 1])),
      );
      await page.reload();
      await page.getByRole("heading", { name: "The last 24 hours" }).waitFor();
      assert.equal(
        await page.locator("nav a[aria-current=page]").innerText(),
        "Stats",
      );
      await page.locator(".skip").focus();
      await page.keyboard.press("Enter");
      assert.equal(
        await page.evaluate(() => document.activeElement?.id),
        "main",
      );
      assert.equal(
        await page.locator("nav a[aria-current=page]").innerText(),
        "Stats",
      );
      await page.locator(".result-item").first().waitFor();
      await page.getByRole("link", { name: "Jackpot", exact: true }).click();
      await page.goBack();
      await page
        .getByRole("heading", { name: "The last 24 hours", exact: true })
        .waitFor();
      await page.goForward();
      await page
        .getByRole("heading", { name: "The jackpot jar.", exact: true })
        .waitFor();
      await page.getByRole("link", { name: "Stats", exact: true }).click();
      await page.locator(".result-item").first().waitFor();
      await page.screenshot({ path: resolve(out, "390-stats.png") });
      await page.screenshot({
        path: resolve(out, "390-stats.jpg"),
        quality: 75,
      });
      await context.close();
    },
  );
  await check(
    "offline, expired and failed live feeds never replay a remembered recording",
    async () => {
      const { page, context } = await pageFor({
        width: 390,
        liveState: "offline",
      });
      await page.evaluate(() =>
        localStorage.setItem("hamster-hour:last-live-id", "6K_uF2s-LSw"),
      );
      assert.equal(await page.locator("iframe").count(), 0);
      assert.equal(await page.locator(".habitat .pixel-cage").count(), 1);
      await page.screenshot({ path: resolve(out, "390-offline.png") });
      state.liveState = "live";
      await page.clock.fastForward(21000);
      await page.locator(".habitat iframe").waitFor();
      state.expiredLive = true;
      await page.clock.fastForward(21000);
      await page.locator(".habitat .pixel-cage").waitFor();
      assert.equal(await page.locator("iframe").count(), 0);
      state.expiredLive = false;
      await page.clock.fastForward(21000);
      await page.locator(".habitat iframe").waitFor();
      state.liveFailure = true;
      await page.clock.fastForward(41000);
      await page.locator(".habitat .pixel-cage").waitFor();
      assert.equal(await page.locator("iframe").count(), 0);
      await context.close();
    },
  );
  await check(
    "automated accessibility in day/night on play, stats and wallet sheet",
    async () => {
      const { default: AxeBuilder } = await import("@axe-core/playwright");
      const { page, context } = await pageFor({ width: 390, mobile: true });
      const audits = [];
      for (const theme of ["day", "night"]) {
        if (theme === "night")
          await page
            .getByRole("button", { name: "Switch to night theme" })
            .click();
        for (const tab of [
          "The wheel",
          "Jackpot",
          "Stats",
          "My bets",
          "Agents",
        ]) {
          await page.getByRole("link", { name: tab, exact: true }).click();
          const r = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze();
          audits.push({
            theme,
            tab,
            violations: r.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              nodes: v.nodes.map((x) => ({
                target: x.target,
                summary: x.failureSummary,
              })),
            })),
          });
        }
      }
      await page.getByRole("button", { name: "Open wheel chat" }).click();
      const chatAudit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      audits.push({
        theme: "night",
        tab: "Chat drawer",
        violations: chatAudit.violations,
      });
      await page.keyboard.press("Escape");
      await page.locator(".wallet-button").click();
      const modalAudit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      audits.push({
        theme: "night",
        tab: "Wallet sheet",
        violations: modalAudit.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((x) => ({
            target: x.target,
            summary: x.failureSummary,
          })),
        })),
      });
      await page.screenshot({ path: resolve(out, "390-wallet.png") });
      await page.keyboard.press("Escape");
      assert.equal(
        await page.evaluate(() =>
          document.activeElement?.classList.contains("wallet-button"),
        ),
        true,
      );
      const desktop = await pageFor({ width: 1440 });
      for (const theme of ["day", "night"]) {
        if (theme === "night")
          await desktop.page
            .getByRole("button", { name: "Switch to night theme" })
            .click();
        await desktop.page
          .getByRole("link", { name: "Stats", exact: true })
          .click();
        await desktop.page.locator(".result-ribbon").scrollIntoViewIfNeeded();
        const r = await new AxeBuilder({ page: desktop.page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        audits.push({
          theme,
          tab: "Desktop play and results",
          violations: r.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((x) => ({
              target: x.target,
              summary: x.failureSummary,
            })),
          })),
        });
      }
      await desktop.context.close();
      await writeFile(
        resolve(out, "accessibility.json"),
        JSON.stringify(audits, null, 2),
      );
      assert.deepEqual(
        audits.flatMap((a) => a.violations),
        [],
      );
      await context.close();
    },
  );
  await check(
    "320/800/1440 reflow, all navigation routes and no page script errors",
    async () => {
      for (const width of [320, 800, 1440]) {
        const { page, context } = await pageFor({ width });
        for (const tab of [
          "The wheel",
          "Jackpot",
          "Stats",
          "My bets",
          "Agents",
        ]) {
          await page.getByRole("link", { name: tab, exact: true }).click();
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
            `${width} ${tab}`,
          );
        }
        await context.close();
      }
      assert.deepEqual(errors, []);
    },
  );
} finally {
  await writeFile(
    resolve(out, "results.json"),
    JSON.stringify({ results, pageErrors: errors }, null, 2),
  );
  await browser.close();
  await new Promise((r) => server.close(r));
}
console.log(
  JSON.stringify(
    {
      passed: results.filter((x) => x.passed).length,
      total: results.length,
      pageErrors: errors,
    },
    null,
    2,
  ),
);
if (results.some((x) => !x.passed) || errors.length) process.exitCode = 1;
