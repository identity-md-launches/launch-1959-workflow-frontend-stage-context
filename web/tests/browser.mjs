import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeAbiParameters,
  encodeEventTopics,
  erc20Abi,
  keccak256,
  getAbiItem,
  toHex,
  parseAbi,
} from "viem";
import { mainnet } from "viem/chains";
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
const hamster = "0x8e7c7936b4f2d4475dc4bacd174dc228d4d24e86",
  vault = "0x1dceb78b36b5f18ac4a130f1ffc76eba0e73d183",
  hook = "0x82f636a92364d13754d7b3e72d460f0be20a28cc";
const vaultAbi = JSON.parse(
  await readFile(resolve(web, "contracts/HamsterVault.json"), "utf8"),
);
const hookAbi = parseAbi([
  "function token() view returns (address)",
  "function VAULT() view returns (address)",
  "function startedAt() view returns (uint256)",
  "function poolId() view returns (bytes32)",
]);
const stateViewAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
]);
const RAY = 10n ** 27n;
const account = "0x1111111111111111111111111111111111111111",
  other = "0x2222222222222222222222222222222222222222";
const GENESIS = 1791847200n,
  NOW = BigInt(Math.floor(new Date("2026-10-20T07:00:00Z").getTime() / 1000)),
  current = (NOW - GENESIS) / 3600n,
  next = current + 1n,
  W = 10n ** 18n;
const fixtureCode = "0x6001600055";
const deploymentBlock = 26229405n,
  blockOffset = deploymentBlock - 1000n;
const leaderboardRpcs = [
  "https://ethereum.public.blockpi.network/v1/rpc/public",
  "https://rpc.mevblocker.io",
  "https://ethereum-rpc.publicnode.com",
  "https://eth.llamarpc.com",
  "https://eth.drpc.org",
  "https://cloudflare-eth.com",
];
const ensAbi = parseAbi([
  "function reverseWithGateways(bytes reverseName, uint256 coinType, string[] gateways) view returns (string resolvedName, address resolver, address reverseResolver)",
  "function resolveWithGateways(bytes name, bytes data, string[] gateways) view returns (bytes result, address resolver)",
]);
config.contracts[0].runtimeCodeHash = keccak256(fixtureCode);
config.contracts[0].deploymentBlock = String(deploymentBlock);
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
    const bytes = await readFile(path);
    res.writeHead(200, {
      "content-type": types[extname(path)] ?? "application/octet-stream",
    });
    res.end(bytes);
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
    priceFailure: false,
    previewFailure: false,
    noEarningStake: false,
    boardAllFail: false,
    boardPrimaryFail: false,
    boardEmpty: false,
    boardDelay: 0,
    boardRequests: [],
    head: blockOffset + 3000n,
    ensName: "tiny-athlete.eth",
    ensMismatch: false,
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
  block += blockOffset;
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
    number: toHex(state.head),
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
  if (method === "eth_blockNumber") return toHex(state.head);
  if (method === "eth_getBlockByNumber" || method === "eth_getBlockByHash")
    return {
      ...block(),
      number:
        params[0]?.startsWith("0x") && method === "eth_getBlockByNumber"
          ? params[0]
          : toHex(state.head),
    };
  if (method === "eth_getCode") return state.badCode ? "0x6000" : fixtureCode;
  if (method === "eth_getBalance") return toHex(100n * W);
  if (method === "eth_gasPrice") return "0x3b9aca00";
  if (method === "eth_estimateGas") return "0x30d40";
  if (method === "eth_getTransactionCount") return "0x1";
  if (method === "eth_getLogs") {
    const from = BigInt(params[0].fromBlock ?? "0x0"),
      to =
        params[0].toBlock === "latest"
          ? state.head
          : BigInt(params[0].toBlock ?? state.head);
    return state.logs.filter(
      (x) =>
        BigInt(x.blockNumber) >= from &&
        BigInt(x.blockNumber) <= to &&
        (!Array.isArray(params[0].topics?.[0]) ||
          (!state.boardEmpty && params[0].topics[0].includes(x.topics[0]))),
    );
  }
  if (method === "eth_getTransactionReceipt") {
    const t = state.hashes.get(params[0]);
    if (!t) return null;
    return {
      transactionHash: params[0],
      transactionIndex: "0x0",
      blockHash: block().hash,
      blockNumber: toHex(state.head),
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
    const target = call.to.toLowerCase();
    if (
      target === mainnet.contracts.ensUniversalResolver.address.toLowerCase()
    ) {
      const { functionName, args } = decodeFunctionData({
        abi: ensAbi,
        data: call.data,
      });
      return encodeFunctionResult({
        abi: ensAbi,
        functionName,
        result:
          functionName === "reverseWithGateways"
            ? [
                args[0].toLowerCase() === account ? state.ensName : "",
                game,
                game,
              ]
            : [
                encodeAbiParameters(
                  [{ type: "address" }],
                  [state.ensMismatch ? other : account],
                ),
                game,
              ],
      });
    }
    const contractAbi =
      target === vault
        ? vaultAbi
        : target === hook
          ? hookAbi
          : target === config.network.uniswapV4.stateView
            ? stateViewAbi
            : undefined;
    if (contractAbi) {
      const { functionName: fn, args } = decodeFunctionData({
        abi: contractAbi,
        data: call.data,
      });
      const rewardState = {
        wallTime: NOW,
        clock: 10000n,
        weight: state.noEarningStake ? 0n : 1000n * W,
        index: 0n,
        hookRate: (7n * W * RAY) / 86400n,
        gameRate: (3n * W * RAY) / 86400n,
        hookCursor: 0n,
        gameCursor: 0n,
        activationCursor: 10n,
        hookReleased: 0n,
        gameReleased: 0n,
        dripPrincipal: 1200n * W,
        dripStart: 0n,
        dripReleased: 200n * W,
        dripEmitted: 200n * W,
        dustScaled: 0n,
      };
      if (fn === "rewardState" && state.previewFailure)
        throw Error("CheckpointRequired");
      const values = {
        token: hamster,
        GAME_V2: game,
        VAULT: vault,
        startedAt: NOW - 86400n,
        poolId: "0x" + "ab".repeat(32),
        getSlot0: [2n ** 95n, 0, 0, 12500],
        currentMiningState: [0n, 1000n * W, 0n],
        bucketsLeft: [500000000n * W, 0n, 100000000n * W, 0n],
        totalStaked: 800n * W,
        totalGrantBalance: 200n * W,
        rewardsPaid: 200n * W,
        dripDeposited: 1200n * W,
        hookDeposited: 700n * W,
        gameDeposited: 300n * W,
        rewardState,
        accounts: [state.noEarningStake ? 0n : 100n * W, 0n, 0n, 0n, 1n],
        positionCounts: [3n, 0n, 0n],
        stakedBalance: 200n * W,
        grantBalance: 150n * W,
        pendingIMD: 5n * W,
        activations: [NOW - 86400n, 1000n * W, 0n],
      };
      let result = values[fn];
      if (fn === "lots")
        result =
          args[1] === 0n
            ? [100n * W, 9n, false]
            : args[1] === 1n
              ? [150n * W, 9n, true]
              : [200n * W, 10n, false];
      if (state.noEarningStake && fn === "lots") result = [0n, 10n, false];
      return encodeFunctionResult({
        abi: contractAbi,
        functionName: fn,
        result,
      });
    }
    if (target === hamster) {
      const { functionName: fn } = decodeFunctionData({
        abi: erc20Abi,
        data: call.data,
      });
      return encodeFunctionResult({
        abi: erc20Abi,
        functionName: fn,
        result:
          fn === "symbol" ? "HAMSTER" : fn === "balanceOf" ? 1000n * W : 0n,
      });
    }
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
        totalPendingJackpotDeposits: 33n * W,
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
  walletAvailable = true,
  initialTab = "play",
  prepare = () => {},
} = {}) {
  reset();
  state.badCode = codeMismatch;
  state.statsFailure = statsFailure;
  state.liveState = liveState;
  prepare();
  const context = await browser.newContext({
    viewport: { width, height: width < 600 ? 844 : 1000 },
    timezoneId: "UTC",
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
  if (!mobile && walletAvailable)
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
    if (u.host === "api.dexscreener.com")
      return route.fulfill({
        status: state.priceFailure ? 503 : 200,
        json: {
          pairs: [
            {
              chainId: "ethereum",
              baseToken: { address: token },
              priceUsd: "2",
              liquidity: { usd: 1000000 },
            },
          ],
        },
      });
    if (u.pathname.endsWith("/imd-deployment.json"))
      return route.fulfill({ json: config });
    if (leaderboardRpcs.some((x) => req.url().startsWith(x))) {
      try {
        const payload = req.postDataJSON();
        const boardLog =
          !Array.isArray(payload) &&
          payload.method === "eth_getLogs" &&
          Array.isArray(payload.params[0]?.topics?.[0]);
        if (boardLog) {
          state.boardRequests.push({ url: req.url(), ...payload.params[0] });
          if (state.boardDelay)
            await new Promise((r) => setTimeout(r, state.boardDelay));
          if (
            state.boardAllFail ||
            (state.boardPrimaryFail && req.url().startsWith(leaderboardRpcs[0]))
          )
            return route.fulfill({
              json: {
                jsonrpc: "2.0",
                id: payload.id,
                error: {
                  code: -32005,
                  message: state.boardAllFail
                    ? "RPC offline"
                    : "block range refused",
                },
              },
            });
        }
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
  await page.goto(url + `#${initialTab}`);
  await page
    .getByRole("heading", {
      name:
        initialTab === "leaderboard" ? "Leaderboard." : "Bet on the hamster.",
    })
    .waitFor();
  if (initialTab === "play")
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
    "leaderboard navigation, Top 5 preview, ENS, copy and wallet-free viewing",
    async () => {
      const { page, context } = await pageFor({
        width: 390,
        walletAvailable: false,
        liveState: "offline",
      });
      await page.locator(".leaderboard-preview-list li").first().waitFor();
      assert.equal(
        await page.locator(".leaderboard-preview-list li").count(),
        2,
      );
      assert.ok(
        (
          await page.locator(".leaderboard-preview-list li").first().innerText()
        ).includes("10.00 IMD"),
      );
      await page
        .locator(".leaderboard-preview")
        .screenshot({ path: resolve(out, "390-top5-preview.png") });
      await page.getByRole("link", { name: "Full leaderboard" }).click();
      await page.getByRole("heading", { name: "Leaderboard." }).waitFor();
      await page
        .locator(".leaderboard-table a")
        .filter({ hasText: "tiny-athlete.eth" })
        .waitFor();
      const rows = page.locator(".leaderboard-table tbody tr");
      assert.equal(await rows.count(), 2);
      assert.ok((await rows.first().innerText()).includes("≈ $20.00"));
      assert.ok((await rows.nth(1).innerText()).includes("1 EXACT"));
      assert.equal(await page.locator(".leaderboard-your-row").count(), 0);
      await page.evaluate(() => {
        window.copiedAddress = "";
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async (text) => {
              window.copiedAddress = text;
            },
          },
        });
      });
      await page
        .getByRole("button", {
          name: `Copy wallet address ${account}`,
          exact: true,
        })
        .click();
      assert.equal(await page.evaluate(() => window.copiedAddress), account);
      assert.equal(
        await page.locator(".leaderboard-table a").first().getAttribute("href"),
        `https://etherscan.io/address/${account}`,
      );
      assert.equal(
        await page
          .getByRole("link", { name: "Leaderboard", exact: true })
          .getAttribute("aria-current"),
        "page",
      );
      await page.screenshot({ path: resolve(out, "390-leaderboard.png") });
      await page.getByRole("link", { name: "Back to the wheel" }).click();
      await page
        .getByRole("heading", { name: "Bet on the hamster." })
        .waitFor();
      await context.close();
    },
  );
  await check(
    "leaderboard top 50 pagination and pinned rank outside top 50",
    async () => {
      const { page, context } = await pageFor({
        width: 1440,
        connected: true,
        initialTab: "leaderboard",
        prepare: () => {
          for (let i = 1; i <= 60; i++)
            addLog(
              "BinaryBet",
              {
                k: current,
                bettor: `0x${(i + 200).toString(16).padStart(40, "0")}`,
                market: 1,
                side: false,
                amount: BigInt(i + 100) * W,
              },
              1010n + BigInt(i),
            );
        },
      });
      await page.locator(".leaderboard-yours").waitFor();
      assert.ok(
        (await page.locator(".leaderboard-your-row").innerText()).includes(
          "#61",
        ),
      );
      assert.ok(
        (await page.locator(".leaderboard-your-row").innerText()).includes(
          "10.00 IMD",
        ),
      );
      assert.equal(
        await page
          .locator(".leaderboard-table tbody:not(.leaderboard-yours) tr")
          .count(),
        10,
      );
      assert.equal(await page.locator(".leaderboard-top").count(), 5);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: resolve(out, "1440-leaderboard.png") });
      await page.getByRole("button", { name: "Next", exact: true }).click();
      assert.ok(
        (
          await page
            .locator(".leaderboard-table tbody:not(.leaderboard-yours) tr")
            .first()
            .innerText()
        ).includes("#11"),
      );
      for (let i = 0; i < 3; i++)
        await page.getByRole("button", { name: "Next", exact: true }).click();
      assert.ok(
        (await page.locator(".leaderboard-pagination").innerText()).includes(
          "41–50 of 50",
        ),
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Next", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(await page.locator(".leaderboard-your-row").count(), 1);
      await page.getByRole("button", { name: "Previous", exact: true }).click();
      await context.close();
    },
  );
  await check(
    "leaderboard loading progress, range fallback, error recovery and empty action",
    async () => {
      const { page, context } = await pageFor({
        width: 390,
        initialTab: "leaderboard",
        prepare: () => {
          state.boardDelay = 300;
          state.boardPrimaryFail = true;
        },
      });
      await page.getByText("Counting bets…", { exact: true }).waitFor();
      await page
        .getByRole("progressbar", { name: "Bet history blocks scanned" })
        .waitFor();
      await page.getByRole("button", { name: "Pause animation" }).click();
      assert.equal(
        await page
          .getByRole("button", { name: "Resume animation" })
          .getAttribute("aria-pressed"),
        "true",
      );
      await page.locator(".leaderboard-table").waitFor();
      assert.ok(
        state.boardRequests.some((x) => x.url.startsWith(leaderboardRpcs[1])),
      );
      assert.ok(
        state.boardRequests.every(
          (x) => BigInt(x.toBlock) - BigInt(x.fromBlock) + 1n <= 2000n,
        ),
      );
      await context.close();
      const empty = await pageFor({
        width: 390,
        initialTab: "leaderboard",
        prepare: () => {
          state.boardEmpty = true;
        },
      });
      await empty.page
        .getByText("No bets yet. Be the first name on the board 🐹", {
          exact: true,
        })
        .waitFor();
      await empty.page.getByRole("link", { name: "Place a bet" }).click();
      await empty.page
        .getByRole("heading", { name: "Bet on the hamster." })
        .waitFor();
      await empty.context.close();
      const error = await pageFor({
        width: 390,
        initialTab: "leaderboard",
        prepare: () => {
          state.boardAllFail = true;
        },
      });
      await error.page
        .getByText("Couldn't load the leaderboard, retrying…", { exact: true })
        .waitFor();
      assert.equal(await error.page.locator(".leaderboard-table").count(), 0);
      state.boardAllFail = false;
      await error.page
        .getByRole("button", { name: "Retry now", exact: true })
        .click();
      await error.page.locator(".leaderboard-table").waitFor();
      await error.context.close();
    },
  );
  await check(
    "leaderboard minute refresh and reload use only new logs; inactive tabs stop polling",
    async () => {
      const { page, context } = await pageFor({
        width: 390,
        initialTab: "leaderboard",
      });
      await page.locator(".leaderboard-table").waitFor();
      assert.ok(
        (
          await page.locator(".leaderboard-table tbody tr").first().innerText()
        ).includes("10.00 IMD"),
      );
      state.boardRequests.length = 0;
      state.head += 2n;
      addLog(
        "TicketBought",
        { k: current, bettor: account, guess: 99n },
        3001n,
      );
      await page.clock.fastForward(60_100);
      await page
        .locator(".leaderboard-table tbody tr")
        .first()
        .filter({ hasText: "15.00 IMD" })
        .waitFor();
      assert.equal(state.boardRequests.length, 1);
      assert.equal(
        BigInt(state.boardRequests[0].fromBlock),
        blockOffset + 3001n,
      );
      state.boardRequests.length = 0;
      await page.reload();
      await page.locator(".leaderboard-table").waitFor();
      assert.ok(
        (
          await page.locator(".leaderboard-table tbody tr").first().innerText()
        ).includes("15.00 IMD"),
      );
      await page.waitForTimeout(200);
      assert.equal(state.boardRequests.length, 0);
      await page.getByRole("link", { name: "Stats", exact: true }).click();
      state.head++;
      await page.clock.fastForward(61_000);
      assert.equal(state.boardRequests.length, 0);
      await context.close();
    },
  );
  await check(
    "leaderboard responsive themes, long ENS, huge amounts, keyboard and accessibility",
    async () => {
      const audits = [];
      const { page, context } = await pageFor({
        width: 390,
        connected: true,
        initialTab: "leaderboard",
        prepare: () => {
          state.ensName =
            "a-very-long-hamster-wallet-name-that-needs-to-wrap.eth";
          addLog(
            "BinaryBet",
            {
              k: current,
              bettor: account,
              market: 0,
              side: true,
              amount: 2n ** 128n - 1n,
            },
            1011n,
          );
        },
      });
      await page.locator(".leaderboard-table").waitFor();
      await page
        .locator(".leaderboard-table bdi")
        .filter({ hasText: "a-very-long" })
        .first()
        .waitFor();
      for (const width of [320, 390, 800, 1440]) {
        await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
        for (const theme of ["day", "night"]) {
          await page.evaluate((t) => {
            document.documentElement.dataset.theme = t;
          }, theme);
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
            `${width} ${theme}`,
          );
          const overflow = await page
            .locator(".leaderboard-table")
            .evaluate((e) => e.scrollWidth > e.clientWidth + 1);
          assert.equal(overflow, false, `table overflow ${width} ${theme}`);
          const audit = await new AxeBuilder({ page })
            .include(".leaderboard-card")
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze();
          audits.push({ width, theme, violations: audit.violations });
          if (width === 390 && theme === "night")
            await page.screenshot({
              path: resolve(out, "390-leaderboard-night.png"),
            });
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator(".leaderboard-copy").first().focus();
      await page.keyboard.press("Tab");
      assert.ok(
        await page.evaluate(
          () =>
            getComputedStyle(document.activeElement).outlineStyle !== "none",
        ),
      );
      await page.emulateMedia({ reducedMotion: "reduce" });
      assert.equal(await page.locator(".leaderboard-table").count(), 1);
      await writeFile(
        resolve(out, "leaderboard-accessibility.json"),
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
    "leaderboard failed refresh keeps saved totals and recovers automatically",
    async () => {
      const { page, context } = await pageFor({
        width: 390,
        initialTab: "leaderboard",
      });
      await page.locator(".leaderboard-table").waitFor();
      state.boardAllFail = true;
      state.head++;
      await page.clock.fastForward(60_100);
      await page
        .getByText("Couldn't load the leaderboard, retrying…", { exact: true })
        .waitFor();
      await page.clock.fastForward(1_000);
      await page
        .locator(".leaderboard-card progress")
        .waitFor({ state: "detached" });
      assert.ok(
        (
          await page.locator(".leaderboard-table tbody tr").first().innerText()
        ).includes("10.00 IMD"),
      );
      await page.getByText(/Showing saved totals through block/).waitFor();
      state.boardAllFail = false;
      addLog(
        "TicketBought",
        { k: current, bettor: account, guess: 99n },
        3001n,
      );
      await page.clock.fastForward(16_000);
      await page
        .locator(".leaderboard-table tbody tr")
        .first()
        .filter({ hasText: "15.00 IMD" })
        .waitFor();
      await context.close();
    },
  );
  await check(
    "jackpot total includes deposits from all hours in strip and tab",
    async () => {
      const { page, context } = await pageFor({ width: 390 });
      await page
        .locator(".jackpot-strip strong")
        .filter({ hasText: "158" })
        .waitFor();
      assert.ok(
        (await page.locator(".jackpot-strip").innerText()).includes(
          "Next hour’s fixed prize:",
        ),
      );
      await page.getByRole("link", { name: "Jackpot", exact: true }).click();
      await page
        .locator(".jackpot-counter")
        .filter({ hasText: "158" })
        .waitFor();
      await page
        .getByLabel("Betting hour · your time")
        .selectOption(String(next + 5n));
      assert.ok(
        (await page.locator(".jackpot-counter").innerText()).includes("158"),
      );
      assert.ok(
        (await page.locator(".jackpot-details").innerText()).includes(
          "Next hour’s fixed prize",
        ),
      );
      await context.close();
    },
  );
  await check(
    "rewards pool appears in Stake and HAMSTER Stats across responsive themes",
    async () => {
      for (const width of [320, 390, 800, 1440]) {
        const { page, context } = await pageFor({
          width,
          liveState: "offline",
          walletAvailable: false,
        });
        await page.getByRole("link", { name: "$HAMSTER", exact: true }).click();
        const pools = page.getByRole("group", {
          name: "Rewards pool",
          exact: true,
        });
        await pools.nth(1).waitFor();
        assert.equal(await pools.count(), 2);
        for (const pool of await pools.all()) {
          await pool.getByText("≈ $4,000.00", { exact: true }).waitFor();
          const text = await pool.innerText();
          for (const value of [
            "2,000 IMD",
            "20 IMD / day",
            "2,920%",
            "Changes with stake and price",
          ])
            assert.ok(text.includes(value), value);
          assert.ok(!text.includes("Your stake share"));
        }
        for (const theme of ["day", "night"]) {
          await page.evaluate(
            (t) => (document.documentElement.dataset.theme = t),
            theme,
          );
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
          );
          const audit = await new AxeBuilder({ page })
            .include(".rewards-pool")
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze();
          await writeFile(
            resolve(out, `rewards-axe-${width}-${theme}.json`),
            JSON.stringify(
              {
                violations: audit.violations,
                passes: audit.passes.map((p) => p.id),
              },
              null,
              2,
            ),
          );
          assert.deepEqual(
            audit.violations,
            [],
            `${width} ${theme} rewards accessibility`,
          );
          if (width === 390 || width === 1440)
            await page.screenshot({
              path: resolve(out, `rewards-${width}-${theme}.png`),
              fullPage: true,
            });
        }
        await context.close();
      }
    },
  );
  await check(
    "connected rewards share includes mature grants and excludes warm-up",
    async () => {
      const { page, context } = await pageFor({ connected: true, width: 390 });
      await page.getByRole("link", { name: "$HAMSTER", exact: true }).click();
      const pool = page.locator(".hamster-stake .rewards-pool");
      await pool.getByText("25%", { exact: true }).waitFor();
      await pool.getByText("5 IMD / day", { exact: true }).waitFor();
      const help = pool.getByText("?", { exact: true });
      await help.focus();
      await page.keyboard.press("Enter");
      assert.equal(await pool.locator("details[open]").count(), 1);
      await page.keyboard.press("Enter");
      assert.equal(await pool.locator("details[open]").count(), 0);
      assert.equal(
        await page.locator(".hamster-stake #stake-amount").count(),
        1,
      );
      assert.equal(state.txs.length, 0);
      await context.close();
    },
  );
  await check(
    "reward price failure leaves IMD visible and retries recover USD and APR",
    async () => {
      const { page, context } = await pageFor({
        width: 390,
        prepare: () => {
          state.priceFailure = true;
        },
      });
      await page.getByRole("link", { name: "$HAMSTER", exact: true }).click();
      const pool = page.locator(".hamster-stake .rewards-pool");
      await pool.getByText("USD price unavailable", { exact: true }).waitFor();
      await pool.getByRole("button", { name: "Retry rewards" }).waitFor();
      assert.ok((await pool.innerText()).includes("2,000 IMD"));
      assert.ok((await pool.innerText()).includes("20 IMD / day"));
      state.priceFailure = false;
      await pool.getByRole("button", { name: "Retry rewards" }).click();
      await pool.getByText("≈ $4,000.00", { exact: true }).waitFor();
      await pool.getByText("2,920%", { exact: true }).waitFor();
      await context.close();
    },
  );
  await check(
    "reward checkpoint and no-earning states avoid invented release or wallet earnings",
    async () => {
      const { page, context } = await pageFor({ width: 390, connected: true });
      state.previewFailure = true;
      await page.getByRole("link", { name: "$HAMSTER", exact: true }).click();
      const pool = page.locator(".hamster-stake .rewards-pool");
      await pool.getByRole("button", { name: "Retry rewards" }).waitFor();
      assert.ok((await pool.innerText()).includes("2,000 IMD"));
      assert.equal(
        await pool.getByText("— IMD / day", { exact: true }).count(),
        2,
      );
      state.previewFailure = false;
      state.noEarningStake = true;
      await pool.getByRole("button", { name: "Retry rewards" }).click();
      await pool
        .getByText("Paused · no earning stake", { exact: true })
        .waitFor();
      await pool.getByText("0%", { exact: true }).first().waitFor();
      assert.equal(
        await pool.getByText("0 IMD / day", { exact: true }).count(),
        2,
      );
      assert.ok(!(await pool.innerText()).includes("NaN"));
      assert.ok(!(await pool.innerText()).includes("Infinity"));
      await context.close();
    },
  );
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
