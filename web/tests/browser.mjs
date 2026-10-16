/** Production-export tests. All wallet/RPC responses here are fixtures, never shipped to dist. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeErrorResult,
  encodeAbiParameters,
  keccak256,
  stringToHex,
  erc20Abi,
  zeroAddress,
  parseEther,
  toHex,
} from "viem";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = resolve(root, "test/scratch/interaction");
await mkdir(out, { recursive: true });
const { chromium } = await import(
  pathToFileURL(
    process.env.IMD_PLAYWRIGHT ??
      "/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs",
  ).href
);
const manifest = JSON.parse(
  await readFile(resolve(root, "dist/imd-deployment.json"), "utf8"),
);
const game = manifest.contracts.find((c) => c.name === "HamsterHour"),
  verifier = manifest.contracts.find((c) => c.name === "OracleVerifier");
const abi = JSON.parse(
  await readFile(resolve(root, "dist", game.abiPath), "utf8"),
);
const vabi = JSON.parse(
  await readFile(resolve(root, "dist", verifier.abiPath), "utf8"),
);
const imd = manifest.network.pairToken.address;
// These test accounts and tokens exist only in the intercepted test transport.
const account = "0x1111111111111111111111111111111111111111";
const team = "0x2222222222222222222222222222222222222222";
const stakeToken = "0x3333333333333333333333333333333333333333";
const hash = "0x" + "ab".repeat(32),
  zeroHash = "0x" + "00".repeat(32);
const uuid =
  "0x753b499634e7420a8768d784231195da00000000000000000000000000000000";
const now = BigInt(Math.floor(Date.now() / 1000));
const genesis = 1791847800n;
const current = (now - genesis) / 3600n;
const next = current + 1n;
const reports = [];
let browser;
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://local").pathname;
    const part = decodeURIComponent(path.replace(/^\/preview\//, ""));
    if (path === "/") {
      res.writeHead(302, { location: "/preview/" });
      return res.end();
    }
    if (!path.startsWith("/preview/") || part.includes("..")) throw Error();
    const file = resolve(root, "dist", part || "index.html");
    res.setHeader(
      "Content-Type",
      mime[extname(file)] ?? "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
function defaultABI(p) {
  if (p.type === "tuple")
    return Object.fromEntries(p.components.map((c) => [c.name, defaultABI(c)]));
  const match = p.type.match(/^(.*)\[(\d*)\]$/);
  if (match)
    return Array.from({ length: Number(match[2] || 0) }, () =>
      defaultABI({ ...p, type: match[1] }),
    );
  if (p.type === "address") return zeroAddress;
  if (p.type === "bool") return false;
  if (p.type === "string") return "";
  if (p.type.startsWith("bytes"))
    return "0x" + "00".repeat(Number(p.type.slice(5) || 0));
  return 0n;
}
function fixture(options = {}) {
  const state = {
    chain: options.wrongChain ? "0x89" : "0x1",
    connected: false,
    account: options.team ? team : account,
    added: false,
    unknownChain: !!options.wrongChain,
    rejectConnect: false,
    rejectSend: false,
    revert: false,
    noCode: !!options.noCode,
    rpcDown: false,
    delayReceipt: false,
    receipts: new Map(),
    sent: [],
    walletCalls: [],
    allowance: 0n,
    stakeAllowance: 0n,
    staked: 0n,
    pending: parseEther("2"),
    hasBet: false,
    hasExact: false,
    stakeConfigured: !!options.stake,
    settings: {},
    claims: 0,
    settled: false,
    voided: false,
    hugeBalance: !!options.hugeBalance,
  };
  const template = abi.find((f) => f.type === "function" && f.name === "window")
    .outputs[0];
  function window(k) {
    const w = defaultABI(template);
    const started = genesis + k * 3600n;
    return {
      ...w,
      status:
        k === next
          ? 1
          : k === current - 1n
            ? 2
            : k === current - 60n
              ? state.voided
                ? 3
                : 1
              : k === current - 2n
                ? state.settled
                  ? 2
                  : 1
                : 0,
      startsAt: started,
      endsAt: started + 3600n,
      line: 1000n,
      source: "https://sepolia.squeekchain.com",
      result: k === current - 1n ? 1470n : 0n,
      pools: [parseEther("12"), parseEther("10"), parseEther("2")],
      over: [parseEther("4"), parseEther("8")],
      sleep: [parseEther("1"), parseEther("1")],
      settler: account,
      requestId: k === current - 1n ? uuid : zeroHash,
    };
  }
  function position(k) {
    return {
      over: [
        0n,
        k === next ? (state.hasBet ? parseEther("0.5") : 0n) : parseEther("1"),
      ],
      sleep: [0n, 0n],
      exactAmount: state.hasExact && k === next ? parseEther("0.5") : 0n,
      guess: 1234n,
      imdClaimed: state.claims > 0,
      jackpotClaimed: false,
    };
  }
  function decode(tx) {
    const token =
      tx.to.toLowerCase() === imd || tx.to.toLowerCase() === stakeToken;
    return {
      ...decodeFunctionData({
        abi: token
          ? erc20Abi
          : tx.to.toLowerCase() === verifier.address
            ? vabi
            : abi,
        data: tx.data,
      }),
      abi: token
        ? erc20Abi
        : tx.to.toLowerCase() === verifier.address
          ? vabi
          : abi,
    };
  }
  function contractCall(tx) {
    const { functionName: fn, args = [], abi: used } = decode(tx);
    const token = used === erc20Abi;
    let result;
    if (token) {
      const stake = tx.to.toLowerCase() === stakeToken;
      const values = {
        symbol: stake ? "STK" : "IMD",
        decimals: stake ? 6 : 18,
        balanceOf: state.hugeBalance
          ? 2n ** 128n - 1n
          : stake
            ? 1000000000n
            : parseEther("1000"),
        allowance: stake ? state.stakeAllowance : state.allowance,
        approve: true,
      };
      result = values[fn];
    } else if (used === vabi) result = fn === "oracleSigner" ? team : false;
    else {
      const globals = {
        currentRound: (now - genesis) / 600n,
        currentWindow: current,
        hasStarted: true,
        closedWindowFloor: 0n,
        currentLine: 1000n,
        settledWindows: 3n,
        stakingToken: state.stakeConfigured ? stakeToken : zeroAddress,
        jackpotToken: zeroAddress,
        IMD: imd,
        TEAM: team,
        sourceUrl: "https://sepolia.squeekchain.com",
        genesisTimestamp: genesis,
        totalStaked: state.staked,
        preStakingReserve: parseEther("3"),
        oracleReserve: parseEther("10"),
        imdLiability: parseEther("24"),
        jackpotLiability: 0n,
        releaseWindows: 3n,
        reserveReleased: parseEther("0.3"),
        releaseTotal: parseEther("3"),
        stakingUndistributed: 0n,
        MIN_BET: parseEther("0.5"),
        TIMEOUT: 172800n,
        CONFIG_DELAY: 172800n,
        MAX_EXACT_ENTRIES: 256n,
        MAX_POOL: 2n ** 128n - 1n,
        oracleVerifier: verifier.address,
        pendingStaking: state.pending,
      };
      if (fn in globals) result = globals[fn];
      else if (fn === "window") result = window(args[0]);
      else if (fn === "windowTimes")
        result = [genesis + args[0] * 3600n, genesis + (args[0] + 1n) * 3600n];
      else if (fn === "isBettingOpen") result = args[0] > current;
      else if (fn === "position") result = position(args[0]);
      else if (fn === "exactEntries") result = state.hasExact ? 2n : 1n;
      else if (fn === "stakes") result = [state.staked, 0n, state.pending];
      else if (fn === "pendingConfig")
        result = state.settings[args[0]] ?? [zeroHash, 0n];
      else if (fn === "question")
        result = `What is the total number of wheel passes recorded by Squeekchain for rounds ${args[0] * 6n} through ${args[0] * 6n + 5n} inclusive, as published at https://sepolia.squeekchain.com? Answer as a single uint256.`;
      else if (state.revert)
        throw {
          code: 3,
          message: "execution reverted",
          data: encodeErrorResult({ abi, errorName: "BettingClosed" }),
        };
      else result = undefined;
    }
    return encodeFunctionResult({ abi: used, functionName: fn, result });
  }
  const block = {
    number: "0x18f0000",
    hash,
    parentHash: hash,
    nonce: "0x0000000000000000",
    sha3Uncles: hash,
    logsBloom: "0x" + "00".repeat(256),
    transactionsRoot: hash,
    stateRoot: hash,
    receiptsRoot: hash,
    miner: team,
    difficulty: "0x0",
    totalDifficulty: "0x0",
    extraData: "0x",
    size: "0x1000",
    gasLimit: "0x1c9c380",
    gasUsed: "0x10000",
    timestamp: toHex(now),
    transactions: [],
    uncles: [],
    baseFeePerGas: "0x3b9aca00",
    mixHash: hash,
    withdrawalsRoot: hash,
    withdrawals: [],
  };
  async function rpc(method, params = []) {
    if (state.rpcDown)
      throw { code: -32000, message: "Fixture RPC unavailable" };
    if (method === "eth_chainId") return "0x1";
    if (method === "eth_getCode") return state.noCode ? "0x" : "0x60006000";
    if (method === "eth_getBlockByNumber") return block;
    if (method === "eth_blockNumber") return block.number;
    if (method === "eth_getBalance") return "0x56bc75e2d63100000";
    if (method === "eth_call") return contractCall(params[0]);
    if (method === "eth_estimateGas") return "0x200000";
    if (method === "eth_getLogs") return [];
    if (method === "eth_gasPrice") return "0x3b9aca00";
    if (method === "eth_maxPriorityFeePerGas") return "0x3b9aca00";
    if (method === "eth_getTransactionCount") return "0x0";
    if (method === "eth_getTransactionReceipt") {
      if (state.delayReceipt) return null;
      return state.receipts.get(params[0]) ?? null;
    }
    if (method === "eth_getTransactionByHash")
      return {
        hash: params[0],
        blockHash: hash,
        blockNumber: block.number,
        from: state.account,
        to: game.address,
        input: "0x",
        value: "0x0",
        nonce: "0x0",
        gas: "0x200000",
        gasPrice: "0x3b9aca00",
        transactionIndex: "0x0",
        type: "0x2",
        chainId: "0x1",
        r: hash,
        s: hash,
        v: "0x1",
      };
    throw { code: -32601, message: "Unhandled fixture RPC " + method };
  }
  async function wallet({ method, params = [] }) {
    state.walletCalls.push({ method, params });
    if (method === "eth_chainId") return state.chain;
    if (method === "eth_requestAccounts") {
      if (state.rejectConnect) {
        state.rejectConnect = false;
        throw { code: 4001, message: "Rejected" };
      }
      state.connected = true;
      return [state.account];
    }
    if (method === "eth_accounts")
      return state.connected ? [state.account] : [];
    if (method === "wallet_requestPermissions") {
      if (state.rejectConnect) {
        state.rejectConnect = false;
        throw { code: 4001, message: "Rejected" };
      }
      state.connected = true;
      return [
        {
          parentCapability: "eth_accounts",
          caveats: [
            { type: "restrictReturnedAccounts", value: [state.account] },
          ],
        },
      ];
    }
    if (method === "wallet_getPermissions")
      return state.connected ? [{ parentCapability: "eth_accounts" }] : [];
    if (method === "wallet_revokePermissions") {
      state.connected = false;
      return null;
    }
    if (method === "wallet_switchEthereumChain") {
      if (state.unknownChain && !state.added)
        throw { code: 4902, message: "Unknown chain" };
      state.chain = params[0].chainId;
      return null;
    }
    if (method === "wallet_addEthereumChain") {
      state.added = true;
      return null;
    }
    if (method === "eth_sendTransaction") {
      if (state.rejectSend) {
        state.rejectSend = false;
        throw { code: 4001, message: "Rejected" };
      }
      const tx = params[0],
        call = decode(tx);
      state.sent.push({ tx, ...call });
      if (call.functionName === "approve") {
        if (tx.to.toLowerCase() === imd) state.allowance = call.args[1];
        else state.stakeAllowance = call.args[1];
      }
      if (call.functionName === "betOverUnder") state.hasBet = true;
      if (call.functionName === "betExact") state.hasExact = true;
      if (call.functionName === "stake") state.staked += call.args[0];
      if (call.functionName === "unstake") state.staked -= call.args[0];
      if (call.functionName === "claimStaking") state.pending = 0n;
      if (call.functionName === "claim") state.claims++;
      if (call.functionName === "settle") state.settled = true;
      if (call.functionName === "voidWindow") state.voided = true;
      if (call.functionName.startsWith("schedule")) {
        const keys = {
          StakingToken: "stakingToken",
          JackpotToken: "jackpotToken",
          SourceUrl: "sourceUrl",
          GenesisTimestamp: "genesisTimestamp",
        };
        const name = keys[call.functionName.slice(8)];
        const type =
          name === "sourceUrl"
            ? "string"
            : name === "genesisTimestamp"
              ? "uint64"
              : "address";
        state.settings[keccak256(stringToHex(name))] = [
          keccak256(encodeAbiParameters([{ type }], [call.args[0]])),
          now + 172800n,
        ];
      }
      const txhash = toHex(BigInt(state.sent.length), { size: 32 });
      state.receipts.set(txhash, {
        transactionHash: txhash,
        transactionIndex: "0x0",
        blockHash: hash,
        blockNumber: block.number,
        from: state.account,
        to: tx.to,
        cumulativeGasUsed: "0x10000",
        gasUsed: "0x10000",
        contractAddress: null,
        logs: [],
        logsBloom: "0x" + "00".repeat(256),
        status: "0x1",
        effectiveGasPrice: "0x3b9aca00",
        type: "0x2",
      });
      return txhash;
    }
    return rpc(method, params);
  }
  return { state, rpc, wallet };
}
async function setup(options = {}) {
  const f = fixture(options);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    ...(options.noProvider
      ? {
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile",
        }
      : {}),
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.exposeFunction("__walletRequest", async (args) => {
    try {
      return { result: await f.wallet(args) };
    } catch (error) {
      return {
        error: {
          code: error.code ?? -32000,
          message: error.message ?? "Fixture error",
        },
      };
    }
  });
  if (!options.noProvider)
    await page.addInitScript(() => {
      const listeners = {};
      const provider = {
        on(event, fn) {
          (listeners[event] ??= []).push(fn);
        },
        removeListener(event, fn) {
          listeners[event] = (listeners[event] ?? []).filter((f) => f !== fn);
        },
        async request(args) {
          const r = await window.__walletRequest(args);
          if (r.error) throw r.error;
          if (args.method === "wallet_switchEthereumChain")
            for (const fn of listeners.chainChanged ?? [])
              fn(args.params[0].chainId);
          if (args.method === "eth_requestAccounts")
            for (const fn of listeners.accountsChanged ?? []) fn(r.result);
          return r.result;
        },
      };
      window.ethereum = provider;
      window.__provider = provider;
      const announce = () =>
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: {
              info: {
                uuid: "a55afc12-1027-4c47-8e56-6a5d1f44a232",
                name: "Test browser wallet",
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
                rdns: "test.hamster.wallet",
              },
              provider,
            },
          }),
        );
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    });
  for (const rpcURL of manifest.network.rpcUrls)
    await page.route(rpcURL, async (route) => {
      const data = route.request().postDataJSON();
      const handle = async (req) => {
        try {
          return {
            jsonrpc: "2.0",
            id: req.id,
            result: await f.rpc(req.method, req.params),
          };
        } catch (e) {
          return { jsonrpc: "2.0", id: req.id, error: e };
        }
      };
      const result = Array.isArray(data)
        ? await Promise.all(data.map(handle))
        : await handle(data);
      await route.fulfill({
        json: result,
        headers: { "access-control-allow-origin": "*" },
      });
    });
  await page.route("https://media.squeekchain.com/live/current.json", (route) =>
    route.fulfill(
      options.stream
        ? { json: { youtubeId: "abcdefghijk" } }
        : { status: 404, body: "Not found" },
    ),
  );
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.fulfill({
      body: '<html><body style="background:#101310;color:white">Fixture video frame</body></html>',
      contentType: "text/html",
    }),
  );
  await page.route("https://api.imd.fun/oracle/requests/**", (route) =>
    route.fulfill({ json: { jobId: "354a39ee-97cf-4e92-84a1-eaa3b55c90e2" } }),
  );
  await page.goto(url);
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .waitFor();
  if (!options.noCode)
    await page.getByText(/Block .*synced/).waitFor({ timeout: 20000 });
  return { page, context, f, errors };
}
async function connect(page) {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Test browser wallet", exact: true })
    .click();
}
async function confirmed(page, id) {
  await page
    .locator(id)
    .getByText("Confirmed on Ethereum.", {
      exact: true,
    })
    .waitFor({ timeout: 20000 });
}
async function check(name, fn) {
  if (process.argv[2] && !name.includes(process.argv[2])) return;
  const start = Date.now();
  try {
    await fn();
    reports.push({ name, passed: true, durationMs: Date.now() - start });
    console.log("PASS " + name);
  } catch (e) {
    reports.push({ name, passed: false, error: e.message });
    console.error("FAIL " + name + ": " + e.message);
    throw e;
  }
}
try {
  browser = await chromium.launch({ headless: true });
  await check(
    "mobile disconnected state, primary action, picker and keyboard",
    async () => {
      const { page, context, errors } = await setup();
      const button = page
        .getByRole("button", { name: "Connect to continue" })
        .first();
      const box = await button.boundingBox();
      assert(
        box.y + box.height <= 844,
        `Primary action below fold: ${box.y + box.height}`,
      );
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: resolve(out, "390-disconnected.png"),
        fullPage: false,
      });
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      assert.equal(
        await page
          .getByRole("button", { name: "Browser wallet", exact: true })
          .count(),
        0,
      );
      await page
        .getByRole("button", { name: "Coinbase Wallet", exact: true })
        .waitFor();
      await page.keyboard.press("Escape");
      assert.equal(
        await page.evaluate(() =>
          document.activeElement.textContent.includes("Connect wallet"),
        ),
        true,
      );
      await page.getByRole("tab", { name: "Bet" }).focus();
      await page.keyboard.press("ArrowRight");
      await page
        .getByText("Staking opens with the token", { exact: true })
        .waitFor();
      assert.deepEqual(errors, []);
      await context.close();
    },
  );
  await check(
    "live stream remains above a visible primary action",
    async () => {
      const { page, context } = await setup({ stream: true });
      await page.locator("iframe").waitFor();
      const box = await page
        .getByRole("button", { name: "Connect to continue" })
        .first()
        .boundingBox();
      assert(
        box.y + box.height <= 844,
        `With video action ends at ${box.y + box.height}`,
      );
      await page.getByRole("button", { name: "Hide stream" }).click();
      await page.getByRole("button", { name: "Resume stream" }).waitFor();
      await context.close();
    },
  );
  await check(
    "wallet rejection, unknown-chain add fallback and exact approval then bet",
    async () => {
      const { page, context, f, errors } = await setup({ wrongChain: true });
      f.state.rejectConnect = true;
      await connect(page);
      await page.getByText(/Request declined/).waitFor();
      await page
        .getByRole("button", { name: "Test browser wallet", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Switch to Ethereum", exact: true })
        .first()
        .click();
      await page
        .getByRole("button", { name: "Approve 0.5 IMD", exact: true })
        .waitFor();
      assert.deepEqual(
        f.state.walletCalls.find((x) => x.method === "wallet_addEthereumChain")
          .params,
        [manifest.walletAddChain],
      );
      await page.locator("#bet-amount").fill("0.1");
      await page
        .getByRole("button", { name: "Approve 0.1 IMD", exact: true })
        .click();
      await page.getByText("The minimum bet is 0.5 IMD.").waitFor();
      assert.equal(f.state.sent.length, 0);
      await page.locator("#bet-amount").fill("0.5");
      f.state.delayReceipt = true;
      await page
        .getByRole("button", { name: "Approve 0.5 IMD", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirming…", exact: true })
        .waitFor();
      assert.equal(f.state.sent.length, 1);
      assert.equal(
        await page
          .getByRole("button", { name: "Confirming…", exact: true })
          .isDisabled(),
        true,
      );
      f.state.delayReceipt = false;
      await page
        .getByRole("button", { name: "Place over / under bet", exact: true })
        .waitFor({ timeout: 20000 });
      assert.equal(f.state.sent[0].functionName, "approve");
      assert.equal(f.state.sent[0].args[0].toLowerCase(), game.address);
      assert.equal(f.state.sent[0].args[1], parseEther("0.5"));
      await page
        .getByRole("button", { name: "Under", exact: false })
        .filter({ has: page.locator(".side-name") })
        .click();
      await page
        .getByRole("button", { name: "Place over / under bet", exact: true })
        .click();
      await page.waitForFunction(() =>
        document
          .querySelector(".bet-panel .tx-feedback")
          ?.textContent.includes("Confirmed"),
      );
      await confirmed(page, ".bet-panel");
      assert.equal(f.state.sent.at(-1).functionName, "betOverUnder");
      assert.deepEqual(f.state.sent.at(-1).args, [
        next,
        false,
        parseEther("0.5"),
      ]);
      assert.deepEqual(errors, []);
      await context.close();
    },
  );
  await check(
    "simulation rejection prevents signing and wallet rejection recovers",
    async () => {
      const { page, context, f } = await setup();
      f.state.allowance = parseEther("100");
      await connect(page);
      await page
        .getByRole("button", { name: "Place over / under bet", exact: true })
        .waitFor();
      f.state.revert = true;
      await page
        .getByRole("button", { name: "Place over / under bet", exact: true })
        .click();
      await page
        .getByText(
          "Betting has closed for this window. Choose the next open window.",
        )
        .waitFor();
      assert.equal(f.state.sent.length, 0);
      f.state.revert = false;
      f.state.rejectSend = true;
      await page
        .getByRole("button", { name: "Place over / under bet", exact: true })
        .click();
      await page.getByText(/Request declined/).waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Place over / under bet", exact: true })
          .isEnabled(),
        true,
      );
      await context.close();
    },
  );
  await check(
    "EXACT validation, ticket uniqueness and Sleep encoding",
    async () => {
      const { page, context, f } = await setup();
      f.state.allowance = parseEther("100");
      await connect(page);
      await page.getByRole("button", { name: "Exact", exact: true }).click();
      await page.locator("#exact-guess").fill("1.5");
      await page
        .getByRole("button", { name: "Place exact bet", exact: true })
        .click();
      await page.getByText(/Enter a whole number/).waitFor();
      await page.locator("#exact-guess").fill("1234");
      await page
        .getByRole("button", { name: "Place exact bet", exact: true })
        .click();
      await confirmed(page, ".bet-panel");
      assert.deepEqual(f.state.sent.at(-1).args, [
        next,
        1234n,
        parseEther("0.5"),
      ]);
      assert.equal(
        await page
          .getByRole("button", { name: "Place exact bet", exact: true })
          .isDisabled(),
        true,
      );
      await page.getByRole("button", { name: "Sleep", exact: true }).click();
      await page
        .getByRole("button", { name: "No, running", exact: false })
        .click();
      await page
        .getByRole("button", { name: "Place sleep bet", exact: true })
        .click();
      await confirmed(page, ".bet-panel");
      assert.deepEqual(f.state.sent.at(-1).args, [
        next,
        false,
        parseEther("0.5"),
      ]);
      await context.close();
    },
  );
  await check(
    "staking token uses its own decimals, approval, unstake and IMD reward claim",
    async () => {
      const { page, context, f } = await setup({ stake: true });
      await connect(page);
      await page.getByRole("tab", { name: "Stake", exact: true }).click();
      await page.locator("#stake-amount").fill("1.25");
      await page
        .getByRole("button", { name: "Approve STK", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Stake tokens", exact: true })
        .waitFor({ timeout: 20000 });
      assert.equal(f.state.sent.at(-1).args[1], 1250000n);
      await page
        .getByRole("button", { name: "Stake tokens", exact: true })
        .click();
      await page.getByText("1.25 STK", { exact: true }).first().waitFor();
      assert.equal(f.state.staked, 1250000n);
      await page.locator("#unstake-amount").fill("0.25");
      await page
        .getByRole("button", { name: "Unstake tokens", exact: true })
        .click();
      await page.getByText("1 STK", { exact: true }).first().waitFor();
      assert.equal(f.state.staked, 1000000n);
      await page
        .getByRole("button", { name: "Claim IMD rewards", exact: true })
        .click();
      await page.getByText("0 IMD", { exact: true }).waitFor();
      assert.equal(f.state.sent.at(-1).functionName, "claimStaking");
      await context.close();
    },
  );
  await check(
    "claim overload, history, oracle links, timeout and settlement",
    async () => {
      const { page, context, f } = await setup();
      await connect(page);
      await page.getByLabel("Include jackpot token").uncheck();
      await page
        .getByRole("button", { name: "Check and claim", exact: true })
        .click();
      await confirmed(page, ".claim-grid");
      assert.deepEqual(f.state.sent.at(-1).args, [current - 1n, false]);
      await page.getByRole("tab", { name: "History", exact: true }).click();
      await page
        .getByRole("link", { name: "Oracle evidence", exact: false })
        .first()
        .waitFor();
      assert.match(
        await page
          .getByRole("link", { name: "Oracle evidence", exact: false })
          .first()
          .getAttribute("href"),
        /explorer.imd.fun\/jobs\/354a39ee/,
      );
      await page
        .getByText("Settle a window & fund the oracle", { exact: true })
        .click();
      await page.locator("#keeper-window").fill(String(current - 60n));
      await page
        .getByRole("button", { name: "Load settlement", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Void timed-out window", exact: true })
        .click();
      await page
        .locator(".keeper")
        .getByText("Confirmed on Ethereum.", {
          exact: true,
        })
        .waitFor();
      assert.equal(f.state.sent.at(-1).functionName, "voidWindow");
      await page.locator("#keeper-window").fill(String(current - 2n));
      await page
        .getByRole("button", { name: "Load settlement", exact: true })
        .click();
      const att = JSON.parse(
        await readFile(
          resolve(root, "docs/references/squeekchain-attestation.json"),
          "utf8",
        ),
      );
      att.domain.verifyingContract = game.address;
      await page.locator("#attestation").fill(JSON.stringify(att));
      await page
        .getByRole("button", { name: "Verify and settle window", exact: true })
        .click();
      await page
        .locator(".keeper .action")
        .filter({
          has: page.getByRole("button", {
            name: "Verify and settle window",
            exact: true,
          }),
        })
        .getByText("Confirmed on Ethereum.", {
          exact: true,
        })
        .waitFor({ timeout: 20000 });
      assert.equal(f.state.sent.at(-1).functionName, "settle");
      assert.equal(f.state.sent.at(-1).args[0], current - 2n);
      await context.close();
    },
  );
  await check(
    "TEAM schedule gates all four settings and validates timelock values",
    async () => {
      const { page, context, f } = await setup({ team: true });
      await connect(page);
      await page
        .getByText("Public settings & TEAM controls", { exact: true })
        .click();
      await page.locator("#setting-stakingToken").fill(stakeToken);
      const first = page.locator(".setting").first();
      await first
        .getByRole("button", { name: "Schedule 48-hour change", exact: true })
        .click();
      await confirmed(page, ".setting:first-of-type");
      assert.equal(f.state.sent.at(-1).functionName, "scheduleStakingToken");
      assert.equal(
        await first
          .getByRole("button", {
            name: "Execute scheduled change",
            exact: true,
          })
          .isDisabled(),
        true,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Schedule 48-hour change", exact: true })
          .count(),
        4,
      );
      const values = [
        ["stakingToken", "StakingToken", stakeToken],
        ["jackpotToken", "JackpotToken", stakeToken],
        ["sourceUrl", "SourceUrl", "https://sepolia.squeekchain.com/status"],
        ["genesisTimestamp", "GenesisTimestamp", String(genesis + 600n)],
      ];
      for (let i = 0; i < values.length; i++) {
        const [key, suffix, value] = values[i];
        const section = page.locator(".setting").nth(i);
        if (i > 0) {
          await page.locator("#setting-" + key).fill(value);
          await section
            .getByRole("button", {
              name: "Schedule 48-hour change",
              exact: true,
            })
            .click();
          await section
            .locator(".action")
            .first()
            .getByText("Confirmed on Ethereum.", { exact: true })
            .waitFor({ timeout: 20000 });
          assert.equal(f.state.sent.at(-1).functionName, "schedule" + suffix);
        }
        // Move only the intercepted proposal timestamp; never wait 48 real hours or send a live transaction.
        f.state.settings[keccak256(stringToHex(key))][1] = now - 1n;
        await page
          .getByRole("button", { name: "Refresh", exact: true })
          .click();
        await section
          .getByRole("button", {
            name: "Execute scheduled change",
            exact: true,
          })
          .click();
        await section
          .locator(".action")
          .last()
          .getByText("Confirmed on Ethereum.", { exact: true })
          .waitFor({ timeout: 20000 });
        assert.equal(f.state.sent.at(-1).functionName, "set" + suffix);
      }
      await context.close();
    },
  );
  await check(
    "mobile wallet links and Coinbase Smart Wallet without a provider",
    async () => {
      const { page, context } = await setup({ noProvider: true });
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      for (const name of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
        await page
          .getByRole("link", { name: "Open in " + name, exact: true })
          .waitFor();
      const rabby = new URL(
        await page
          .getByRole("link", { name: "Open in Rabby", exact: true })
          .getAttribute("href"),
      );
      assert.equal(rabby.searchParams.get("_cmd"), "open-dapp");
      assert.equal(rabby.searchParams.get("dapp"), url);
      await page
        .getByRole("button", { name: "Coinbase Smart Wallet", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Browser wallet", exact: true })
          .count(),
        0,
      );
      await page.screenshot({ path: resolve(out, "mobile-wallet-picker.png") });
      await context.close();
    },
  );
  await check(
    "existing allowance resets to zero, then approves only the requested amount",
    async () => {
      const { page, context, f } = await setup();
      f.state.allowance = parseEther("0.1");
      await connect(page);
      await page
        .getByRole("button", { name: "Reset IMD allowance", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Approve 0.5 IMD", exact: true })
        .waitFor({ timeout: 20000 });
      assert.equal(f.state.sent.at(-1).args[1], 0n);
      await page
        .getByRole("button", { name: "Approve 0.5 IMD", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Place over / under bet", exact: true })
        .waitFor({ timeout: 20000 });
      assert.equal(f.state.sent.at(-1).args[1], parseEther("0.5"));
      await context.close();
    },
  );
  await check(
    "oracle reserve donation uses explicit approval and game funding function",
    async () => {
      const { page, context, f } = await setup();
      await connect(page);
      await page.getByRole("tab", { name: "History", exact: true }).click();
      await page
        .getByText("Settle a window & fund the oracle", { exact: true })
        .click();
      await page.locator("#oracle-fund").fill("2");
      await page
        .getByRole("button", { name: "Approve donation", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Donate to oracle reserve", exact: true })
        .waitFor({ timeout: 20000 });
      assert.equal(f.state.sent.at(-1).args[1], parseEther("2"));
      await page
        .getByRole("button", { name: "Donate to oracle reserve", exact: true })
        .click();
      await page
        .locator(".keeper .action")
        .filter({
          has: page.getByRole("button", {
            name: "Donate to oracle reserve",
            exact: true,
          }),
        })
        .getByText("Confirmed on Ethereum.", {
          exact: true,
        })
        .waitFor({ timeout: 20000 });
      assert.equal(f.state.sent.at(-1).functionName, "fundOracleReserve");
      assert.deepEqual(f.state.sent.at(-1).args, [parseEther("2")]);
      await context.close();
    },
  );
  await check(
    "pending transaction survives reload and blocks duplicate submission",
    async () => {
      const { page, context, f } = await setup();
      await connect(page);
      f.state.delayReceipt = true;
      await page
        .getByRole("button", { name: "Approve 0.5 IMD", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirming…", exact: true })
        .waitFor();
      await page.reload();
      await page
        .getByRole("button", { name: "Check confirmation", exact: true })
        .waitFor();
      assert.equal(f.state.sent.length, 1);
      assert.equal(
        await page
          .getByRole("button", {
            name: "Check pending transaction",
            exact: true,
          })
          .isDisabled(),
        true,
      );
      f.state.delayReceipt = false;
      await page
        .getByRole("button", { name: "Check confirmation", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Place over / under bet", exact: true })
        .waitFor({ timeout: 20000 });
      assert.equal(f.state.sent.length, 1);
      assert.equal(
        await page.evaluate(
          (key) => localStorage.getItem(key),
          "hamster-hour:pending:" + manifest.launchId,
        ),
        null,
      );
      await context.close();
    },
  );
  await check(
    "runtime rejects an ABI that differs from its attested hash",
    async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.route(url + game.abiPath, (route) =>
        route.fulfill({ json: abi.slice(1) }),
      );
      await page.goto(url);
      await page
        .getByText(
          "Contract ABI verification failed. Transactions are unavailable.",
          { exact: true },
        )
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Connect wallet", exact: true })
          .count(),
        0,
      );
      await context.close();
    },
  );
  await check(
    "missing contract code disables writes; long values reflow at 320",
    async () => {
      const a = await setup({ noCode: true });
      await connect(a.page);
      await a.page.getByText(/has no code/).waitFor();
      assert.equal(
        await a.page
          .getByRole("button", { name: "Approve 0.5 IMD", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(a.f.state.sent.length, 0);
      await a.context.close();
      const { page, context } = await setup({ hugeBalance: true });
      await connect(page);
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        await page.locator(".account-menu>summary").click();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        await page.locator(".account-menu>summary").click();
      }
      await context.close();
    },
  );
} catch (e) {
  console.error(e.stack);
  if (browser) {
    const pages = browser.contexts().flatMap((c) => c.pages());
    for (let i = 0; i < pages.length; i++) {
      await pages[i]
        .screenshot({ path: resolve(out, `failure-${i}.png`), fullPage: true })
        .catch(() => {});
      await writeFile(
        resolve(out, `failure-${i}.txt`),
        await pages[i]
          .locator("body")
          .innerText()
          .catch(() => ""),
      );
    }
  }
  process.exitCode = 1;
} finally {
  await writeFile(
    resolve(out, "results.json"),
    JSON.stringify({ fixtureOnly: true, reports }, null, 2),
  );
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
}
