/** Production-export tests. All wallet/RPC responses here are fixtures, never shipped to dist. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
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
  parseAbi,
  hashTypedData,
  hexToString,
  encodeEventTopics,
} from "viem";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = resolve(root, "test/scratch/interaction");
await mkdir(out, { recursive: true });
const { chromium, webkit } = await import(
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
const intake = "0xa43e6f75ee006411f79ac1c84120606c2330de82";
const intakeABI = parseAbi([
  "function priceOf(bytes32 action,address asset) view returns(uint256)",
  "function request(bytes32 action,bytes body,(address target,bytes4 selector) callback,address asset,uint256 amount) payable returns(bytes32 requestId)",
]);
const { generatePrivateKey, privateKeyToAccount } =
  await import("viem/accounts");
// A fresh throwaway signer for intercepted RPC tests only. No key or mock response is exported.
const signer = privateKeyToAccount(generatePrivateKey());
const oracleTypes = {
  OracleAttestation: [
    ["requestId", "bytes32"],
    ["chainId", "uint256"],
    ["questionHash", "bytes32"],
    ["answerType", "uint8"],
    ["answer", "bytes"],
    ["figure", "uint256"],
    ["fromBlock", "uint64"],
    ["toBlock", "uint64"],
    ["blockHash", "bytes32"],
    ["panelJobId", "bytes32"],
    ["panelSize", "uint16"],
    ["quorum", "uint16"],
    ["agreed", "uint16"],
    ["issuedAt", "uint64"],
    ["expiresAt", "uint64"],
  ].map(([name, type]) => ({ name, type })),
};
const oracleDomain = {
  name: "IdentityMD Oracle",
  version: "2",
  chainId: 1,
  verifyingContract: game.address,
};
const oracleUUID = "753b4996-34e7-420a-8768-d784231195da";
const now = BigInt(Math.floor(Date.now() / 1000));
const genesis = 1791847800n;
const current = (now - genesis) / 3600n;
const next = current + 1n;
const message = {
  requestId: uuid,
  chainId: 1n,
  questionHash: hash,
  answerType: 3,
  answer: toHex(1470n, { size: 32 }),
  figure: 1470n,
  fromBlock: 26204211n,
  toBlock: 26205000n,
  blockHash: hash,
  panelJobId: uuid,
  panelSize: 20,
  quorum: 14,
  agreed: 18,
  issuedAt: now,
  expiresAt: now + 86400n,
};
const signature = await signer.signTypedData({
  domain: oracleDomain,
  types: oracleTypes,
  primaryType: "OracleAttestation",
  message,
});
const signedJSON = JSON.stringify(
  {
    domain: oracleDomain,
    types: oracleTypes,
    message,
    signature,
    signer: signer.address,
  },
  (_, v) => (typeof v === "bigint" ? String(v) : v),
);
const reports = [];
let browser;
const mime = {
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
    signed: [],
    chat: options.chat ?? [],
    chatReject: "",
    live: options.sleeping
      ? { state: "idle", playback: { kind: "canonical-hls" } }
      : {
          state: "live",
          playback: {
            kind: "youtube",
            publicId: options.stream ? "abcdefghijk" : "6K_uF2s-LSw",
          },
        },
    proxyDown: !!options.proxyDown,
    liveRequests: 0,
    speed: options.speed ?? 0,
    cumulativeWorkUnits: options.counter ?? "45200",
    recentSettlements: options.rounds ?? [
      {
        previousSettledThroughRound: String(current * 6n),
        settledThroughRound: String(current * 6n + 1n),
        cumulativeWork: "45100",
        workAdded: "100",
      },
      {
        previousSettledThroughRound: String(current * 6n - 1n),
        settledThroughRound: String(current * 6n),
        cumulativeWork: "45000",
        workAdded: "100",
      },
    ],
    roundsRequests: 0,
    statusRequests: 0,
    jackpotConfigured: !!options.jackpot,
    pools: options.empty
      ? [0n, 0n, 0n]
      : [parseEther("12"), parseEther("10"), parseEther("2")],
    allowance: options.allowance ?? 0n,
    oracleAllowance: 0n,
    oracleBody: null,
    answerReady: false,
    preflightBodies: [],
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
      line: options.line ?? 1000n,
      source: "https://sepolia.squeekchain.com",
      result: k === current - 1n ? 1470n : 0n,
      pools: state.pools,
      rewards: [parseEther("10.92"), parseEther("9.1"), parseEther("1.82")],
      over: [parseEther("4"), parseEther("8")],
      sleep: [parseEther("1"), parseEther("1")],
      settler: account,
      requestId: k === current - 1n ? uuid : zeroHash,
    };
  }
  function position(k) {
    return {
      over:
        k === next
          ? [0n, state.hasBet ? parseEther("0.5") : 0n]
          : options.lose
            ? [parseEther("1"), 0n]
            : [0n, parseEther("1")],
      sleep: [0n, 0n],
      exactAmount: state.hasExact && k === next ? parseEther("0.5") : 0n,
      guess: 1234n,
      imdClaimed: state.claims > 0,
      jackpotClaimed: false,
    };
  }
  function decode(tx) {
    if (tx.to.toLowerCase() === intake)
      return {
        ...decodeFunctionData({ abi: intakeABI, data: tx.data }),
        abi: intakeABI,
      };
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
    if (used === intakeABI)
      result = fn === "priceOf" ? parseEther("0.5") : hash;
    else if (token) {
      const stake = tx.to.toLowerCase() === stakeToken;
      const values = {
        symbol: stake ? "STK" : "IMD",
        decimals: stake ? 6 : 18,
        balanceOf: state.hugeBalance
          ? 2n ** 128n - 1n
          : stake
            ? 1000000000n
            : options.lowBalance
              ? parseEther("0.1")
              : parseEther("1000"),
        allowance: stake
          ? state.stakeAllowance
          : typeof args[1] === "string" && args[1].toLowerCase() === intake
            ? state.oracleAllowance
            : state.allowance,
        approve: true,
      };
      result = values[fn];
    } else if (used === vabi)
      result =
        fn === "oracleSigner"
          ? signer.address
          : fn === "attestationDigest"
            ? hashTypedData({
                domain: { ...oracleDomain, verifyingContract: args[1] },
                types: oracleTypes,
                primaryType: "OracleAttestation",
                message: args[0],
              })
            : false;
    else {
      const globals = {
        currentRound: (now - genesis) / 600n,
        currentWindow: current,
        hasStarted: true,
        closedWindowFloor: 0n,
        currentLine: options.line ?? 1000n,
        settledWindows: 3n,
        stakingToken: state.stakeConfigured ? stakeToken : zeroAddress,
        jackpotToken: state.jackpotConfigured ? imd : zeroAddress,
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
      else if (
        args[0] !== undefined &&
        typeof args[0] === "bigint" &&
        args[0] > 10n ** 12n
      )
        throw {
          code: 3,
          message: "execution reverted",
          data: encodeErrorResult({ abi, errorName: "InvalidWindow" }),
        };
      else if (fn === "window") result = window(args[0]);
      else if (fn === "windowTimes")
        result = [genesis + args[0] * 3600n, genesis + (args[0] + 1n) * 3600n];
      else if (fn === "isBettingOpen") result = args[0] > current;
      else if (fn === "position") result = position(args[0]);
      else if (fn === "exactEntries") result = state.hasExact ? 2n : 1n;
      else if (fn === "stakes") result = [state.staked, 0n, state.pending];
      else if (fn === "pendingConfig")
        result = state.settings[args[0]] ?? [zeroHash, 0n];
      else if (fn === "questionHash") result = hash;
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
    number: toHex(26205000n),
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
    if (method === "eth_getLogs") {
      const event = abi.find((x) => x.type === "event" && x.name === "Bet");
      const topics = encodeEventTopics({
        abi: [event],
        eventName: "Bet",
        args: { windowId: current - 1n, bettor: state.account, market: 0 },
      });
      if (options.portfolio && params[0].topics?.[0] === topics[0])
        return [
          {
            address: game.address,
            blockHash: hash,
            blockNumber: toHex(26204900n),
            transactionHash: hash,
            transactionIndex: "0x0",
            logIndex: "0x0",
            removed: false,
            topics,
            data: encodeAbiParameters(
              [{ type: "uint256" }, { type: "uint256" }],
              [1n, parseEther("1")],
            ),
          },
        ];
      const settingEvent = abi.find(
        (x) => x.type === "event" && x.name === "ConfigScheduled",
      );
      const settingTopics = encodeEventTopics({
        abi: [settingEvent],
        eventName: "ConfigScheduled",
        args: { setting: keccak256(stringToHex("sourceUrl")) },
      });
      if (
        params[0].topics?.[0] === settingTopics[0] &&
        state.settings[settingTopics[1]]
      )
        return [
          {
            address: game.address,
            blockHash: hash,
            blockNumber: toHex(26204900n),
            transactionHash: hash,
            transactionIndex: "0x0",
            logIndex: "0x1",
            removed: false,
            topics: settingTopics,
            data: encodeAbiParameters(
              [{ type: "bytes" }, { type: "uint64" }],
              [
                encodeAbiParameters(
                  [{ type: "string" }],
                  ["https://sepolia.squeekchain.com"],
                ),
                now + 172800n,
              ],
            ),
          },
        ];
      return [];
    }
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
      if (options.legacy)
        throw {
          code: -32601,
          message: "Legacy wallet has no permissions method",
        };
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
    if (method === "personal_sign") {
      state.signed.push(hexToString(params[0]));
      return "0x" + "11".repeat(65);
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
        if (tx.to.toLowerCase() === imd) {
          if (call.args[0].toLowerCase() === intake)
            state.oracleAllowance = call.args[1];
          else state.allowance = call.args[1];
        } else state.stakeAllowance = call.args[1];
      }
      if (call.functionName === "request")
        state.oracleBody = JSON.parse(hexToString(call.args[1]));
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
        status: state.failNext ? "0x0" : "0x1",
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
    reducedMotion: options.fresh ? "no-preference" : "reduce",
    ...(options.noProvider
      ? {
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile",
        }
      : {}),
  });
  const page = await context.newPage();
  if (options.clock) await page.clock.install();
  const errors = [];
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  if (!options.fresh)
    await page.addInitScript(() =>
      localStorage.setItem("hamster-hour:intro-dismissed:v1", "yes"),
    );
  if (!options.fresh && !options.firstGuide)
    await page.addInitScript(() =>
      localStorage.setItem("hamster-hour:how-it-works:v1", "closed"),
    );
  page.on("pageerror", (e) => errors.push(e.message));
  await page.exposeFunction("__walletRequest", async (args) => {
    try {
      return { result: await f.wallet(args) };
    } catch (error) {
      console.log("Wallet fixture error", args.method, error.message);
      return {
        error: {
          code: error.code ?? -32000,
          message: error.message ?? "Fixture error",
        },
      };
    }
  });
  if (!options.noProvider)
    await page.addInitScript(
      ({ legacy, multiple }) => {
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
        if (legacy) return;
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
        if (multiple) {
          const announceSecond = () =>
            window.dispatchEvent(
              new CustomEvent("eip6963:announceProvider", {
                detail: {
                  info: {
                    uuid: "145afc12-1027-4c47-8e56-6a5d1f44a232",
                    name: "Second test wallet",
                    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
                    rdns: "test.hamster.second",
                  },
                  provider: { ...provider },
                },
              }),
            );
          window.addEventListener("eip6963:requestProvider", announceSecond);
          announceSecond();
        }
      },
      { legacy: !!options.legacy, multiple: !!options.multiple },
    );
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
          console.log("RPC fixture error", req.method, e.message);
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
  await page.route(
    "https://hamster-hour.hamsterhour562.workers.dev/**",
    async (route) => {
      const req = route.request(),
        u = new URL(req.url());
      if (u.pathname === "/live") f.state.liveRequests++;
      if (u.pathname === "/status") f.state.statusRequests++;
      if (u.pathname === "/rounds") f.state.roundsRequests++;
      if (f.state.proxyDown) return route.abort("failed");
      const cors = { "access-control-allow-origin": "*" };
      if (u.pathname === "/live")
        return route.fulfill({ json: f.state.live, headers: cors });
      if (u.pathname === "/status")
        return route.fulfill({
          headers: cors,
          json: {
            schemaVersion: 1,
            measurement: {
              freshness: "online",
              cumulativeWorkUnits: f.state.cumulativeWorkUnits,
              speedMmPerSecond: f.state.speed,
            },
          },
        });
      if (u.pathname === "/rounds")
        return route.fulfill({
          headers: cors,
          json: { recentSettlements: f.state.recentSettlements },
        });
      if (u.pathname === "/chat" && req.method() === "GET") {
        const since = Number(u.searchParams.get("since") ?? 0);
        return route.fulfill({
          headers: cors,
          json: {
            messages: f.state.chat.filter((m) => m.ts > since),
            now: Date.now(),
          },
        });
      }
      if (u.pathname === "/chat" && req.method() === "POST") {
        const body = req.postDataJSON();
        if (f.state.chatReject)
          return route.fulfill({
            status: 400,
            headers: cors,
            json: { error: f.state.chatReject },
          });
        const m = { id: `m${f.state.chat.length + 1}`, ...body };
        delete m.signature;
        f.state.chat.push(m);
        return route.fulfill({ headers: cors, json: { ok: true, message: m } });
      }
      return route.fulfill({ status: 404, headers: cors, json: {} });
    },
  );
  await page.route("https://www.youtube.com/**", (route) =>
    route.fulfill({
      body: '<html><body style="background:#101310;color:white">Fixture video frame</body></html>',
      contentType: "text/html",
    }),
  );
  await page.route("https://api.imd.fun/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/requests/capabilities")
      return route.fulfill({
        json: {
          onchain: {
            chains: [
              {
                chainId: 1,
                intake,
                asset: imd,
                actions: [
                  {
                    action: "oracle.request",
                    version: "oracle-1",
                    actionId: stringToHex("oracle.request@oracle-1", {
                      size: 32,
                    }),
                    amount: "500000000000000000",
                  },
                ],
              },
            ],
          },
        },
      });
    if (path === "/requests/check") {
      f.state.preflightBodies.push(route.request().postDataJSON());
      return route.fulfill({ json: { blockers: [] } });
    }
    if (path.startsWith("/intake/"))
      return route.fulfill({
        json: {
          entries: [
            {
              action: "oracle.request",
              intake,
              payer: f.state.account,
              state: "admitted",
              admission: {
                result: {
                  kind: "oracle",
                  requestId: oracleUUID,
                  jobId: "354a39ee-97cf-4e92-84a1-eaa3b55c90e2",
                },
              },
            },
          ],
        },
      });
    if (path.endsWith("/attestation"))
      return route.fulfill(
        f.state.answerReady
          ? { body: signedJSON, contentType: "application/json" }
          : { status: 404, json: { error: "not_attested" } },
      );
    return route.fulfill({
      json: { jobId: "354a39ee-97cf-4e92-84a1-eaa3b55c90e2" },
    });
  });
  await page.goto(url);
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .waitFor();
  if (!options.noCode)
    await page
      .getByText(/Live from Ethereum · block/)
      .waitFor({ timeout: 20000 });
  return { page, context, f, errors, consoleErrors };
}
/** One detected extension connects in one tap; the picker only lists several wallets. */
async function connect(page) {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  assert.equal(await page.locator(".wallet-sheet[open]").count(), 0);
}
async function more(page, name) {
  await page.locator(".more-menu summary").click();
  await page
    .locator(".more-popover")
    .getByRole("button", { name, exact: true })
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
  if (process.env.HH_TEST && !name.includes(process.env.HH_TEST)) return;

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
  const engine = process.env.HH_BROWSER === "webkit" ? webkit : chromium;
  browser = await engine.launch({ headless: true });
  await check(
    "maintenance: all five sheets, public pages and progress at 1280, 800 and 375",
    async () => {
      for (const width of [1280, 800, 375]) {
        const { page, context, errors, consoleErrors, f } = await setup({
          noProvider: true,
        });
        await page.setViewportSize({
          width,
          height: width === 375 ? 812 : 1000,
        });
        const direct = [];
        page.on("request", (r) => {
          if (new URL(r.url()).hostname.endsWith("squeekchain.com"))
            direct.push(r.url());
        });
        const progress = page.locator(".play-panel .window-progress");
        await progress.getByText(/200 passes so far · line 1000/).waitFor();
        assert.equal(
          await progress.getByRole("progressbar").getAttribute("aria-valuenow"),
          "20",
        );
        assert(
          await progress
            .getByText(
              "Live counter, unofficial. Result is settled by the IMD oracle.",
            )
            .isVisible(),
        );
        assert(f.state.roundsRequests > 0);
        if (width === 375) {
          const audit = await new AxeBuilder({ page })
            .exclude("iframe")
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze();
          assert.deepEqual(
            audit.violations,
            [],
            "running progress accessibility",
          );
        }
        if (width <= 800) {
          assert.equal(
            await progress
              .locator(".window-progress-summary")
              .evaluate((el) => getComputedStyle(el).whiteSpace),
            "nowrap",
          );
          assert(
            await progress
              .locator(".window-progress-bar")
              .evaluate((el) => el.clientWidth <= el.parentElement.clientWidth),
          );
        }
        for (const choice of [
          "OVER",
          "UNDER",
          "SLEEPING",
          "RUNNING",
          "EXACT",
        ]) {
          if (choice === "EXACT")
            await page
              .getByRole("button", { name: /Guess the exact number/ })
              .click();
          else {
            await page
              .getByRole("button", {
                name: `Bet ${choice === "RUNNING" ? "SLEEPING" : choice}`,
                exact: true,
              })
              .click();
            if (choice === "RUNNING")
              await page
                .getByRole("button", { name: /Bet RUNNING instead/ })
                .click();
          }
          await page
            .getByRole("heading", { name: `Bet ${choice}`, exact: true })
            .waitFor();
          await page
            .locator("#bet-amount")
            .fill("123456789012345678901234567890.5");
          const layout = await page.locator(".amount-input").evaluate((el) => {
            const input = el.querySelector("input"),
              suffix = el.querySelector("span");
            const s = suffix.getBoundingClientRect(),
              i = input.getBoundingClientRect(),
              p = el.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(suffix);
            return {
              nowrap: getComputedStyle(suffix).whiteSpace,
              minWidth: parseFloat(getComputedStyle(suffix).minWidth),
              lines: range.getClientRects().length,
              inside: s.right <= p.right && i.right <= s.left + 1,
              inputWidth: i.width,
            };
          });
          assert.equal(layout.nowrap, "nowrap");
          assert(layout.minWidth > 20);
          assert.equal(layout.lines, 1);
          assert(layout.inside);
          assert(layout.inputWidth > 50);
          await page
            .getByRole("button", { name: "5 IMD", exact: true })
            .click();
          assert.equal(await page.locator("#bet-amount").inputValue(), "5");
          if (choice === "EXACT")
            assert.equal(
              await page.getByText(/The jackpot pays only/).count(),
              0,
            );
          await page.screenshot({
            path: resolve(
              out,
              `maintenance-${choice.toLowerCase()}-${width}.png`,
            ),
          });
          await page.keyboard.press("Escape");
        }
        await page.locator(".how-it-works summary").click();
        assert(await page.locator("#bet-window").isVisible());
        assert.equal(await page.getByText(/Available jackpot:/).count(), 0);
        await page.screenshot({
          path: resolve(out, `maintenance-how-${width}.png`),
          fullPage: true,
        });
        for (const tab of ["History", "TEAM", "Stake", "Settle"]) {
          await more(page, tab);
          if (tab === "History") {
            await page.locator(".history-row").first().waitFor();
            await page.locator("#history-window").fill(String(current - 1n));
            await page
              .getByRole("button", { name: "Find window", exact: true })
              .click();
            await page.locator(".window-detail .key-values").waitFor();
          } else if (tab === "TEAM") {
            await page.locator(".setting").first().waitFor();
            assert.equal(await page.locator(".settings input").count(), 0);
            assert.equal(await page.locator(".setting").count(), 4);
          }
          assert(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          );
          await page.screenshot({
            path: resolve(out, `maintenance-${tab.toLowerCase()}-${width}.png`),
            fullPage: true,
          });
        }
        assert.deepEqual(direct, []);
        assert.deepEqual(errors, []);
        assert.deepEqual(consoleErrors, []);
        await context.close();
      }
    },
  );
  await check(
    "maintenance: first-visit guide and collapse preference survive navigation and reload",
    async () => {
      const { page, context, errors } = await setup({ firstGuide: true });
      const guide = page.locator(".how-it-works");
      assert(await guide.evaluate((el) => el.open));
      await page.locator(".play-panel .window-progress").waitFor();
      const first = await page
        .getByRole("button", { name: "Bet OVER", exact: true })
        .boundingBox();
      assert(
        first && first.y + first.height <= 844,
        "main action visible at 390×844",
      );
      await page.screenshot({
        path: resolve(out, "maintenance-first-screen-390.png"),
      });
      await page.reload();
      await page
        .getByRole("button", { name: "Bet OVER", exact: true })
        .waitFor();
      assert.equal(await guide.evaluate((el) => el.open), false);
      await guide.locator("summary").click();
      await page.reload();
      await guide.locator("summary").waitFor();
      assert.equal(await guide.evaluate((el) => el.open), true);
      await guide.locator("summary").click();
      await more(page, "History");
      await page.getByRole("button", { name: "Bet", exact: true }).click();
      assert.equal(await guide.evaluate((el) => el.open), false);
      await page.reload();
      await guide.locator("summary").waitFor();
      assert.equal(await guide.evaluate((el) => el.open), false);
      assert.deepEqual(errors, []);
      await context.close();
    },
  );
  await check(
    "maintenance: sleeping zero counter, My bets, fallback baselines and twenty-second polling",
    async () => {
      for (const width of [1280, 800, 375]) {
        const { page, context, f, errors } = await setup({
          sleeping: true,
          counter: "45000",
          clock: true,
        });
        await page.setViewportSize({
          width,
          height: width === 375 ? 812 : 1000,
        });
        const progress = page.locator(".play-panel .window-progress");
        await progress.getByText(/0 passes so far/).waitFor();
        assert.equal(
          await progress.getByRole("progressbar").getAttribute("aria-valuenow"),
          "0",
        );
        await connect(page);
        await page
          .locator(".my-bets .window-progress")
          .getByText(/0 passes so far/)
          .waitFor();
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          "connected My bets must not widen the page",
        );
        if (width === 375) {
          const audit = await new AxeBuilder({ page })
            .exclude("iframe")
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze();
          assert.deepEqual(
            audit.violations,
            [],
            "zero-pass My bets accessibility",
          );
        }
        await page.screenshot({
          path: resolve(out, `maintenance-sleeping-${width}.png`),
          fullPage: true,
        });
        const before = [f.state.statusRequests, f.state.roundsRequests];
        f.state.cumulativeWorkUnits = "45001";
        await page.clock.fastForward(20100);
        await progress.getByText(/1 pass so far/).waitFor();
        assert(
          f.state.statusRequests > before[0] &&
            f.state.roundsRequests > before[1],
        );
        f.state.recentSettlements = [
          {
            previousSettledThroughRound: String(current * 6n - 2n),
            settledThroughRound: String(current * 6n - 1n),
            cumulativeWork: "44800",
            workAdded: "100",
          },
        ];
        await page.clock.fastForward(20100);
        await progress.getByText(/≈201 passes so far/).waitFor();
        f.state.recentSettlements = [];
        await page.clock.fastForward(20100);
        await progress
          .locator(".window-progress-summary")
          .getByText(/^round [1-6] of 6$/)
          .waitFor();
        assert.equal(await progress.getByRole("progressbar").count(), 0);
        assert.deepEqual(errors, []);
        await context.close();
      }
    },
  );
  await check(
    "maintenance: jackpot copy follows configuration; chat and poke counters pluralize",
    async () => {
      const { page, context, f, errors } = await setup({
        clock: true,
        line: 1n,
        chat: [
          {
            id: "one",
            address: account,
            message: "hello wheel",
            ts: Date.now(),
          },
        ],
      });
      await page.getByText("1 message", { exact: true }).waitFor();
      assert.match(
        await page.locator(".line-unit").innerText(),
        /wheel pass\b/,
      );
      assert(
        !/wheel passes/.test(await page.locator(".line-unit").innerText()),
      );
      await page
        .locator(".play-panel [role='progressbar'][aria-valuenow='100']")
        .waitFor();
      await page.getByRole("button", { name: "Poke the hamster" }).click();
      await page.getByText("poked 1 time", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Poke the hamster" }).click();
      await page.getByText("poked 2 times", { exact: true }).waitFor();
      f.state.chat.push({
        id: "two",
        address: account,
        message: "keep running",
        ts: Date.now() + 1,
      });
      await page.clock.fastForward(5100);
      await page.getByText("2 messages", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: /Guess the exact number/ })
        .click();
      assert.equal(await page.getByText(/The jackpot pays only/).count(), 0);
      await page.keyboard.press("Escape");
      await page.locator(".how-it-works summary").click();
      assert.equal(await page.getByText(/Available jackpot:/).count(), 0);
      f.state.jackpotConfigured = true;
      await page.clock.fastForward(12100);
      await page.getByText(/Available jackpot:/).waitFor();
      await page
        .getByRole("button", { name: /Guess the exact number/ })
        .click();
      await page
        .getByText(
          /The jackpot pays only if the closest guess is within 2% of the result/,
        )
        .waitFor();
      assert.deepEqual(errors, []);
      await context.close();
    },
  );
  await check(
    "revision: failed idle refresh uses the fallback and recovers",
    async () => {
      for (const width of [375, 1440]) {
        const { page, context, f, errors } = await setup({
          sleeping: true,
          clock: true,
        });
        await page.setViewportSize({
          width,
          height: width === 1440 ? 900 : 812,
        });
        await page.locator(".sleep-screen").waitFor();
        const initialBox = await page.locator(".player").boundingBox();
        const savedId = width === 1440 ? "abcdefghijk" : "6K_uF2s-LSw";
        if (width === 1440)
          await page.evaluate(
            (id) => localStorage.setItem("hamster-hour:last-live-id", id),
            savedId,
          );
        f.state.proxyDown = true;
        const failed = () =>
          page.waitForEvent("requestfailed", (r) => r.url().endsWith("/live"));
        const firstFailure = failed();
        await page.clock.fastForward(20100);
        await firstFailure;
        // Give the query's rejected promise time to schedule its one retry.
        await page.waitForTimeout(100);
        const retryFailure = failed();
        await page.clock.fastForward(1500);
        await retryFailure;
        await page.locator(".player iframe").waitFor();
        assert.equal(
          await page.locator(".player iframe").getAttribute("src"),
          `https://www.youtube.com/embed/${savedId}?autoplay=1&mute=1`,
        );
        assert.equal(await page.locator(".sleep-screen").count(), 0);
        assert.equal(await page.locator(".live-badge").innerText(), "LIVE");
        assert.equal(await page.locator(".page-sleeping").count(), 0);
        assert.deepEqual(
          await page.locator(".player").boundingBox(),
          initialBox,
        );
        assert(f.state.liveRequests >= 3);
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await page.screenshot({
          path: resolve(out, `revision-fallback-${width}.png`),
        });

        f.state.proxyDown = false;
        const recovered = page.waitForResponse(
          (r) => r.url().endsWith("/live") && r.ok(),
        );
        await page.clock.fastForward(20100);
        await recovered;
        await page.locator(".sleep-screen").waitFor();
        assert.equal(await page.locator("iframe").count(), 0);
        f.state.live = {
          state: "live",
          playback: { kind: "youtube", publicId: "abcdefghijk" },
        };
        await page.clock.fastForward(20100);
        await page.locator('iframe[src*="abcdefghijk"]').waitFor();
        assert.deepEqual(errors, []);
        await context.close();
      }
    },
  );
  await check(
    "revision: one legacy or discovered wallet connects directly; multiple wallets keep the picker",
    async () => {
      for (const legacy of [true, false]) {
        const { page, context, f, errors, consoleErrors } = await setup({
          legacy,
        });
        f.state.rejectConnect = true;
        await page
          .getByRole("button", { name: "Connect wallet", exact: true })
          .click();
        await page.locator(".wallet-error").waitFor();
        assert.equal(await page.locator(".wallet-sheet[open]").count(), 0);
        await page
          .getByRole("button", { name: "Connect wallet", exact: true })
          .click();
        await page.locator(".account-menu").waitFor();
        assert.equal(
          f.state.walletCalls.filter(
            (c) =>
              c.method === "eth_requestAccounts" ||
              (!legacy && c.method === "wallet_requestPermissions"),
          ).length,
          2,
        );
        assert.equal(await page.locator(".wallet-sheet[open]").count(), 0);
        assert.deepEqual(errors, []);
        assert.deepEqual(consoleErrors, []);
        await context.close();
      }
      const { page, context, f, errors } = await setup({ multiple: true });
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await page.locator(".wallet-sheet[open]").waitFor();
      assert.equal(
        f.state.walletCalls.filter((c) => c.method === "eth_requestAccounts")
          .length,
        0,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Browser wallet", exact: true })
          .count(),
        0,
      );
      await page
        .getByRole("button", { name: "Second test wallet", exact: true })
        .click();
      await page.locator(".account-menu").waitFor();
      assert.deepEqual(errors, []);
      await context.close();
    },
  );
  await check(
    "revision: fast speed means zoomies until current-window passes exceed twice the line",
    async () => {
      const { page, context, f, errors, consoleErrors } = await setup({
        speed: 200,
        clock: true,
      });
      await page.getByText("mood: zoomies", { exact: true }).waitFor();
      assert.equal(
        await page.evaluate(
          (key) => localStorage.getItem(key),
          `hamster-hour:window-start:${current}`,
        ),
        "45200",
      );
      f.state.cumulativeWorkUnits = "47200";
      const statusUpdate = page.waitForResponse((r) =>
        r.url().endsWith("/status"),
      );
      await page.clock.fastForward(20100);
      await statusUpdate;
      assert.equal(await page.locator(".mood").innerText(), "mood: zoomies");
      f.state.cumulativeWorkUnits = "47201";
      await page.clock.fastForward(20100);
      await page.getByText("mood: villain era", { exact: true }).waitFor();
      f.state.speed = 0;
      await page.clock.fastForward(20100);
      await page.getByText("mood: sleeping", { exact: true }).waitFor();
      assert.deepEqual(errors, []);
      assert.deepEqual(consoleErrors, []);
      await context.close();
    },
  );
  await check(
    "revision: pool and jackpot reels show exact digits at rest and after updates",
    async () => {
      const { page, context, f, errors, consoleErrors } = await setup({
        clock: true,
        jackpot: true,
      });
      await page.setViewportSize({ width: 1440, height: 900 });
      async function aligned(value) {
        const slot = page.locator(`.slot[aria-label="${value}"]`);
        await slot.waitFor();
        const digits = await slot.evaluate((el) => {
          const expected = el.getAttribute("aria-label").replace(/\D/g, "");
          return [...el.querySelectorAll(".slot-digit")].map((clip, i) => {
            const row =
              clip.querySelectorAll(".slot-reel > span")[Number(expected[i])];
            const bounds = clip.getBoundingClientRect(),
              actual = row.getBoundingClientRect();
            return {
              expected: expected[i],
              top: actual.top - bounds.top,
              height: actual.height,
              clipHeight: bounds.height,
            };
          });
        });
        for (const digit of digits) {
          assert(
            Math.abs(digit.top) < 0.1,
            `${value}: digit ${digit.expected} is not aligned (${digit.top}px)`,
          );
          assert(Math.abs(digit.height - digit.clipHeight) < 0.1);
        }
        return digits;
      }
      await aligned("24");
      await page.screenshot({ path: resolve(out, "revision-reels-1440.png") });
      await page.locator(".how-it-works summary").click();
      await aligned("976");
      f.state.pools = [parseEther("1009.08"), 0n, 0n];
      await page.clock.fastForward(12100);
      await aligned("1,009.08");
      await page.emulateMedia({ reducedMotion: "no-preference" });
      f.state.pools = [parseEther("24"), 0n, 0n];
      await page.clock.fastForward(12100);
      await page.locator('.slot[aria-label="24"]').waitFor();
      await page.waitForTimeout(1000);
      await aligned("24");
      assert.deepEqual(errors, []);
      assert.deepEqual(consoleErrors, []);
      await context.close();
    },
  );
  await check(
    "intro video, dismissal, return visit and responsive first screen",
    async () => {
      const { page, context, errors } = await setup({ fresh: true });
      for (const width of [375, 1440]) {
        await page.setViewportSize({
          width,
          height: width === 1440 ? 1000 : 812,
        });
        if (width === 1440) {
          await page.evaluate(() =>
            localStorage.removeItem("hamster-hour:intro-dismissed:v1"),
          );
          await page.reload();
        }
        await page
          .getByRole("button", { name: "Start playing", exact: true })
          .waitFor();
        await page.waitForFunction(
          () => document.querySelector("video")?.readyState >= 2,
        );
        assert.equal(
          await page.locator("video").getAttribute("src"),
          "./assets/hamster-chewing.mp4",
        );
        await page.screenshot({ path: resolve(out, `intro-${width}.png`) });
        const start = Date.now();
        await page
          .getByRole("button", { name: "Start playing", exact: true })
          .click();
        await page.locator("iframe").waitFor();
        assert(Date.now() - start < 3000);
        assert.match(
          await page.locator("iframe").getAttribute("src"),
          /6K_uF2s-LSw\?autoplay=1&mute=1/,
        );
      }
      await page.reload();
      assert.equal(await page.locator(".intro-overlay").count(), 0);
      for (const width of [320, 375, 390, 768, 1440]) {
        // Portrait tablets are 1024 tall; phones and desktops are checked at 844.
        const height = width === 768 ? 1024 : 844;
        await page.setViewportSize({ width, height });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        const box = await page
          .getByRole("button", { name: "Bet OVER", exact: true })
          .boundingBox();
        assert(
          box.y + box.height < height,
          `Bet OVER below the fold at ${width}`,
        );
        if ([390, 1440].includes(width))
          await page.screenshot({ path: resolve(out, `bet-${width}.png`) });
      }
      assert.deepEqual(errors, []);
      await context.close();
    },
  );
  await check("stream publicId switches only to a valid video", async () => {
    const { page, context } = await setup({ stream: true });
    await page.waitForFunction(() =>
      document.querySelector("iframe")?.src.includes("abcdefghijk"),
    );
    assert.equal(await page.locator(".live-badge").innerText(), "LIVE");
    await context.close();
  });
  await check(
    "idle feed shows SLEEPING at 375 and 1440; proxy failure falls back to the last stream",
    async () => {
      const { page, context, errors } = await setup({ sleeping: true });
      for (const width of [375, 1440]) {
        await page.setViewportSize({
          width,
          height: width === 1440 ? 1000 : 812,
        });
        await page.getByText("HAMSTER IS SLEEPING · stream is off").waitFor();
        assert.equal(await page.locator("iframe").count(), 0);
        assert.equal(await page.locator(".live-badge").innerText(), "SLEEPING");
        await page.getByText(/45,200 passes total/).waitFor();
        const box = await page.locator(".player").boundingBox();
        assert(Math.abs(box.width / box.height - 16 / 9) < 0.02);
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        assert(
          (
            await page
              .locator(".app-shell")
              .evaluate((el) => getComputedStyle(el).filter)
          ).includes("brightness(0.9)"),
        );
        assert.equal(await page.locator(".mood").innerText(), "mood: sleeping");
        await page.screenshot({ path: resolve(out, `sleeping-${width}.png`) });
      }
      await context.close();
      const down = await setup({ proxyDown: true });
      await down.page.locator("iframe").waitFor();
      assert.match(
        await down.page.locator("iframe").getAttribute("src"),
        /6K_uF2s-LSw\?autoplay=1&mute=1/,
      );
      assert.equal(await down.page.locator(".sleep-screen").count(), 0);
      assert.deepEqual(errors, []);
      await down.context.close();
    },
  );
  await check(
    "wheel chat: read-only, then a signed post appears and server words surface",
    async () => {
      const { page, context, f, errors } = await setup();
      f.state.chat.push({
        id: "m0",
        address: team,
        message: "<b>wheel</b> go brr",
        ts: Date.now() - 60000,
      });
      await page.getByRole("button", { name: "Connect to chat" }).waitFor();
      await page.getByText("<b>wheel</b> go brr", { exact: true }).waitFor();
      assert.equal(await page.locator(".chat-text b").count(), 0);
      await connect(page);
      await page.locator("#chat-draft").fill("see https://evil.example");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await page.getByText("No links in chat.", { exact: true }).waitFor();
      await page.locator("#chat-draft").fill("gm hamster");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await page.getByText("gm hamster", { exact: true }).waitFor();
      assert.equal(f.state.signed.length, 1);
      assert.match(
        f.state.signed[0],
        /^Hamster Hour chat\n\d{13}\ngm hamster$/,
      );
      assert.equal(f.state.chat.at(-1).address.toLowerCase(), account);
      await page
        .locator(".chat-row")
        .filter({ hasText: "0x1111…1111" })
        .locator(".bet-tag")
        .waitFor();
      f.state.chatReject = "rate limited";
      await page.locator("#chat-draft").fill("again");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await page
        .getByText("Slow down: one message every 5 seconds.", { exact: true })
        .waitFor();
      await context.close();
      // A second visitor sees the posted message within one poll.
      const second = await setup();
      second.f.state.chat = f.state.chat;
      await second.page
        .getByText("gm hamster", { exact: true })
        .waitFor({ timeout: 6000 });
      assert.deepEqual(errors, []);
      await second.context.close();
    },
  );
  await check("poke counter, logo sunglasses and the Konami spin", async () => {
    const { page, context, errors } = await setup({
      fresh: true,
      sleeping: true,
    });
    await page
      .getByRole("button", { name: "Start playing", exact: true })
      .click();
    await page.getByRole("button", { name: "Poke the hamster" }).click();
    await page.getByText("poked 1 time", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Poke the hamster" }).click();
    await page.getByText("poked 2 times", { exact: true }).waitFor();
    await page.reload();
    await page.getByText("poked 2 times", { exact: true }).waitFor();
    for (let i = 0; i < 10; i++)
      await page.getByRole("link", { name: "Hamster Hour home" }).click();
    await page.locator(".shades").waitFor();
    await page.getByText("deal with it", { exact: true }).waitFor();
    for (const key of [
      "ArrowUp",
      "ArrowUp",
      "ArrowDown",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ArrowLeft",
      "ArrowRight",
      "b",
      "a",
    ])
      await page.keyboard.press(key);
    await page.locator(".app-shell.spin").waitFor();
    await page
      .getByRole("button", { name: "Bet SLEEPING", exact: true })
      .click();
    await page.getByRole("button", { name: /Bet RUNNING instead/ }).click();
    await page.getByRole("heading", { name: "Bet RUNNING" }).waitFor();
    assert.deepEqual(errors, []);
    await context.close();
  });
  await check(
    "one click approval then exactly one OVER bet; chips and success",
    async () => {
      const { page, context, f, errors } = await setup();
      await connect(page);
      await page.getByRole("button", { name: "Bet OVER", exact: true }).click();
      await page.getByRole("button", { name: "5 IMD", exact: true }).click();
      assert.equal(await page.locator("#bet-amount").inputValue(), "5");
      f.state.delayReceipt = true;
      await page
        .getByRole("button", { name: "Place bet", exact: true })
        .click();
      await page.getByText("Approving…", { exact: true }).waitFor();
      await page.waitForFunction(() =>
        document
          .querySelector(".amount-sheet .tx-feedback")
          ?.textContent.includes("Submitted"),
      );
      assert.equal(f.state.sent.length, 1);
      assert.equal(f.state.sent[0].functionName, "approve");
      assert.equal(f.state.sent[0].args[1], parseEther("5"));
      f.state.delayReceipt = false;
      await page
        .getByText(/Bet placed. You win about/)
        .waitFor({ timeout: 30000 });
      assert.deepEqual(
        f.state.sent.map((x) => x.functionName),
        ["approve", "betOverUnder"],
      );
      assert.deepEqual(f.state.sent[1].args, [next, true, parseEther("5")]);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: resolve(out, "bet-success-390.png") });
      await context.close();
    },
  );
  await check(
    "existing allowance uses one transaction; UNDER, SLEEPING and hidden EXACT",
    async () => {
      const { page, context, f } = await setup({
        allowance: parseEther("100"),
      });
      await connect(page);
      for (const [choice, fn, arg] of [
        ["UNDER", "betOverUnder", false],
        ["SLEEPING", "betSleep", true],
      ]) {
        await page
          .getByRole("button", { name: `Bet ${choice}`, exact: true })
          .click();
        await page
          .getByRole("button", { name: "Place bet", exact: true })
          .click();
        await page.getByText(/Bet placed/).waitFor({ timeout: 20000 });
        assert.equal(f.state.sent.at(-1).functionName, fn);
        assert.equal(f.state.sent.at(-1).args[1], arg);
        await page.getByRole("button", { name: "Back to the wheel" }).click();
      }
      assert.equal(await page.locator(".market-button").count(), 3);
      await page
        .getByRole("button", { name: /Guess the exact number/ })
        .click();
      await page.locator("#exact-guess").fill("1234");
      await page
        .getByRole("button", { name: "Place bet", exact: true })
        .click();
      await page.getByText("Bet placed. Your exact guess is in.").waitFor();
      assert.equal(f.state.sent.at(-1).functionName, "betExact");
      assert.equal(f.state.sent.at(-1).args[1], 1234n);
      assert.equal(f.state.sent.length, 3);
      await context.close();
    },
  );
  await check(
    "rejection, amount validation and wrong-chain recovery",
    async () => {
      const { page, context, f } = await setup({
        wrongChain: true,
        allowance: parseEther("10"),
      });
      f.state.rejectConnect = true;
      await connect(page);
      await page
        .locator(".wallet-error")
        .getByText(/Request declined/)
        .waitFor();
      await connect(page);
      await page
        .getByRole("button", { name: "Switch to Ethereum", exact: true })
        .click();
      assert.deepEqual(
        f.state.walletCalls.find((x) => x.method === "wallet_addEthereumChain")
          .params,
        [manifest.walletAddChain],
      );
      await page.getByRole("button", { name: "Bet OVER", exact: true }).click();
      await page.locator("#bet-amount").fill("0.1");
      await page
        .getByRole("button", { name: "Place bet", exact: true })
        .click();
      await page
        .getByText("The minimum bet is 0.5 IMD.", { exact: true })
        .waitFor();
      assert.equal(f.state.sent.length, 0);
      await page.locator("#bet-amount").fill("1");
      f.state.rejectSend = true;
      await page
        .getByRole("button", { name: "Place bet", exact: true })
        .click();
      await page.getByText(/Request declined/).waitFor();
      assert.equal(f.state.sent.length, 0);
      assert(
        await page
          .getByRole("button", { name: "Place bet", exact: true })
          .isEnabled(),
      );
      await context.close();
    },
  );
  await check(
    "mobile wallet paths, focus return, low balance and no-TEAM controls",
    async () => {
      const { page, context } = await setup({ noProvider: true });
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      for (const name of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
        assert(
          await page
            .getByRole("link", { name: `Open in ${name}`, exact: false })
            .isVisible(),
        );
      assert(
        await page
          .getByRole("button", { name: "Coinbase Smart Wallet" })
          .isVisible(),
      );
      await page.keyboard.press("Escape");
      assert(
        await page.evaluate(() =>
          document.activeElement.textContent.includes("Connect wallet"),
        ),
      );
      await context.close();
      const x = await setup({ lowBalance: true });
      await connect(x.page);
      await x.page
        .getByRole("link", { name: "Get IMD", exact: true })
        .waitFor();
      await more(x.page, "TEAM");
      assert.equal(await x.page.locator(".team-form").count(), 0);
      assert.equal(await x.page.locator(".settings input").count(), 0);
      assert.equal(await x.page.locator(".setting").count(), 4);
      await x.context.close();
    },
  );
  await check(
    "TEAM schedule shows decoded pending value and execute date publicly",
    async () => {
      const { page, context, f } = await setup({ team: true });
      await connect(page);
      await more(page, "TEAM");
      await page
        .locator("#setting-sourceUrl")
        .fill("https://sepolia.squeekchain.com");
      await page
        .locator(".setting")
        .filter({
          has: page.getByRole("heading", { name: "Source URL", exact: true }),
        })
        .getByRole("button", { name: "Schedule 48-hour change" })
        .click();
      await page.getByText("Confirmed on Ethereum.", { exact: true }).waitFor();
      assert.equal(f.state.sent.at(-1).functionName, "scheduleSourceUrl");
      await page.getByText("Scheduled value", { exact: true }).waitFor();
      assert(await page.getByText(/Executable from/).isVisible());
      await context.close();
    },
  );
  await check("automatic wallet result discovery and one claim", async () => {
    const { page, context, f } = await setup({ portfolio: true });
    await connect(page);
    await page
      .getByRole("button", { name: "Claim", exact: true })
      .waitFor({ timeout: 20000 });
    assert(await page.getByText("1470 passes", { exact: true }).isVisible());
    // Winning card: confetti, thumbs-up mascot and the share link.
    await page.locator(".result-card.won .confetti").waitFor();
    assert.match(
      await page.locator(".result-card.won img").getAttribute("src"),
      /hamster-thumbs\.svg/,
    );
    const share = page.getByRole("link", { name: /share my W/ });
    assert.match(
      await share.getAttribute("href"),
      /^https:\/\/x\.com\/intent\/post\?text=.*1470.*/,
    );
    await page.screenshot({ path: resolve(out, "result-win-390.png") });
    await page.getByRole("button", { name: "Claim", exact: true }).click();
    await page.getByText("Confirmed on Ethereum.", { exact: true }).waitFor();
    assert.deepEqual(f.state.sent.at(-1).args, [current - 1n, true]);
    await context.close();
  });
  await check("losing card feeds the hamster and shares the L", async () => {
    const { page, context, errors } = await setup({
      portfolio: true,
      lose: true,
    });
    await connect(page);
    await page
      .getByText("you fed the hamster", { exact: true })
      .waitFor({ timeout: 20000 });
    await page
      .getByText("$HAMSTER mining coming soon", { exact: true })
      .waitFor();
    assert.match(
      await page.locator(".result-card.lost video").getAttribute("src"),
      /hamster-chewing\.mp4/,
    );
    assert.match(
      await page.getByRole("link", { name: /share my L/ }).getAttribute("href"),
      /^https:\/\/x\.com\/intent\/post\?text=.*1470/,
    );
    assert.equal(await page.locator(".confetti").count(), 0);
    await page.screenshot({ path: resolve(out, "result-loss-390.png") });
    assert.deepEqual(errors, []);
    await context.close();
  });
  await check(
    "oracle approve + paid request, persistence, signed prefill and settle encoding",
    async () => {
      const { page, context, f, errors } = await setup();
      await connect(page);
      await more(page, "Settle");
      await page.locator("#keeper-window").fill(String(current - 2n));
      await page.getByRole("button", { name: "Load settlement" }).click();
      await page
        .getByRole("button", {
          name: "Buy oracle answer · 0.5 IMD",
          exact: true,
        })
        .click();
      await page
        .getByRole("link", { name: "View oracle panel", exact: true })
        .waitFor({ timeout: 30000 });
      assert.deepEqual(
        f.state.sent.map((x) => x.functionName),
        ["approve", "request"],
      );
      assert.equal(f.state.sent[0].args[0].toLowerCase(), intake);
      assert.equal(f.state.sent[0].args[1], parseEther("0.5"));
      const body = f.state.oracleBody;
      assert.deepEqual(Object.keys(body), [
        "v",
        "question",
        "chainId",
        "window",
        "answerType",
        "evidence",
        "panelSize",
        "quorum",
        "validForSeconds",
        "consumer",
      ]);
      assert.deepEqual(body.window, { hours: 24 });
      assert.equal(body.panelSize, 20);
      assert.equal(body.quorum, 14);
      assert.equal(body.validForSeconds, 86400);
      assert.deepEqual(body.consumer, {
        chainId: 1,
        verifyingContract: game.address,
      });
      assert.equal(
        body.question,
        `What is the total number of wheel passes recorded by Squeekchain for rounds ${(current - 2n) * 6n} through ${(current - 2n) * 6n + 5n} inclusive, as published at https://sepolia.squeekchain.com? Answer as a single uint256.`,
      );
      assert.deepEqual(f.state.preflightBodies[0], {
        action: "oracle.request",
        input: body,
      });
      assert(
        await page
          .getByRole("button", { name: "Settle", exact: true })
          .isDisabled(),
      );
      await page.reload();
      await page.getByText(/Live from Ethereum/).waitFor();
      await more(page, "Settle");
      await page.locator("#keeper-window").fill(String(current - 2n));
      await page.getByRole("button", { name: "Load settlement" }).click();
      await page
        .getByRole("link", { name: "View payment", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", {
            name: "Buy oracle answer · 0.5 IMD",
            exact: true,
          })
          .count(),
        0,
      );
      f.state.answerReady = true;
      await page
        .getByRole("button", { name: "Check now", exact: true })
        .click();
      await page.waitForFunction(() =>
        document.querySelector("#attestation")?.value.includes("signature"),
      );
      assert(
        await page
          .getByRole("button", { name: "Settle", exact: true })
          .isEnabled(),
      );
      await page.getByRole("button", { name: "Settle", exact: true }).click();
      await page
        .getByText("Confirmed on Ethereum.", { exact: true })
        .waitFor({ timeout: 20000 });
      const call = f.state.sent.at(-1);
      assert.equal(call.functionName, "settle");
      assert.equal(call.args[0], current - 2n);
      assert.equal(call.args[1].answerType, 3);
      assert.equal(call.args[1].panelSize, 20);
      assert.equal(call.args[1].questionHash, hash);
      assert.equal(call.args[2], signature);
      assert.deepEqual(errors, []);
      await context.close();
    },
  );
  await check(
    "a reverted oracle payment shows the failed receipt and restores Buy",
    async () => {
      const { page, context, f, errors } = await setup({
        allowance: parseEther("10"),
      });
      await connect(page);
      await more(page, "Settle");
      await page.locator("#keeper-window").fill(String(current - 2n));
      await page.getByRole("button", { name: "Load settlement" }).click();
      f.state.oracleAllowance = parseEther("1");
      f.state.failNext = true;
      await page
        .getByRole("button", {
          name: "Buy oracle answer · 0.5 IMD",
          exact: true,
        })
        .click();
      await page
        .getByRole("link", { name: "View failed receipt ↗" })
        .waitFor({ timeout: 20000 });
      await page.getByText(/The oracle payment did not go through/).waitFor();
      await page
        .getByRole("button", {
          name: "Buy oracle answer · 0.5 IMD",
          exact: true,
        })
        .waitFor();
      assert.equal(
        await page
          .getByRole("link", { name: "View payment", exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page.evaluate(
          (k) => localStorage.getItem(k),
          `hamster-hour:oracle:${game.address}:${current - 2n}`,
        ),
        null,
      );
      await page.screenshot({ path: resolve(out, "oracle-failed-390.png") });
      assert.deepEqual(errors, []);
      await context.close();
    },
  );
  await check(
    "an invalid window lookup shows the error and a way back",
    async () => {
      const { page, context, errors } = await setup();
      await page.locator(".how-it-works summary").click();
      await page.locator("#bet-window").fill("99999999999999");
      await page
        .getByRole("button", { name: "Load window", exact: true })
        .click();
      await page
        .getByText(/could not load: This window does not exist/)
        .waitFor({ timeout: 20000 });
      assert.equal(await page.getByText("Reading pool…").count(), 0);
      await page.getByText("Pool unavailable").first().waitFor();
      await page
        .getByRole("button", { name: "Back to next open window", exact: true })
        .click();
      await page
        .locator(".play-heading")
        .getByText(`#${next}`, { exact: true })
        .waitFor();
      await page.getByText("pays x1.36", { exact: true }).waitFor();
      assert.equal(await page.locator(".notice.error").count(), 0);
      assert.deepEqual(errors, []);
      await context.close();
    },
  );
  await check(
    "oracle purchase is disabled for future or unfunded windows",
    async () => {
      for (const options of [{}, { empty: true }]) {
        const { page, context } = await setup(options);
        await connect(page);
        await more(page, "Settle");
        await page
          .locator("#keeper-window")
          .fill(String(options.empty ? current - 2n : next));
        await page.getByRole("button", { name: "Load settlement" }).click();
        await page
          .getByRole("button", {
            name: "Buy oracle answer · 0.5 IMD",
            exact: true,
          })
          .waitFor();
        assert(
          await page
            .getByRole("button", {
              name: "Buy oracle answer · 0.5 IMD",
              exact: true,
            })
            .isDisabled(),
        );
        await context.close();
      }
    },
  );
  await check(
    "staking, unstaking and reward claims remain available",
    async () => {
      const { page, context, f } = await setup({ stake: true });
      await connect(page);
      await more(page, "Stake");
      await page.locator("#stake-amount").fill("2");
      await page
        .getByRole("button", { name: "Approve STK", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Stake tokens", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Stake tokens", exact: true })
        .click();
      await page.waitForFunction(() =>
        document
          .querySelector(".stake-section")
          ?.textContent.includes("Your stake2 STK"),
      );
      await page.locator("#unstake-amount").fill("1");
      await page
        .getByRole("button", { name: "Unstake tokens", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Claim IMD rewards", exact: true })
        .click();
      await page
        .getByText("No claimable rewards yet.", { exact: true })
        .waitFor();
      assert.deepEqual(
        f.state.sent.map((x) => x.functionName),
        ["approve", "stake", "unstake", "claimStaking"],
      );
      await context.close();
    },
  );
} catch (e) {
  console.error(e.stack);
  process.exitCode = 1;
  if (browser)
    for (const [i, page] of browser
      .contexts()
      .flatMap((c) => c.pages())
      .entries()) {
      await page
        .screenshot({ path: resolve(out, `failure-${i}.png`), fullPage: true })
        .catch(() => {});
      await writeFile(
        resolve(out, `failure-${i}.txt`),
        await page
          .locator("body")
          .innerText()
          .catch(() => ""),
      );
    }
} finally {
  await writeFile(
    resolve(out, `results-${process.env.HH_BROWSER ?? "chromium"}.json`),
    JSON.stringify({ fixtureOnly: true, reports }, null, 2),
  );
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
}
