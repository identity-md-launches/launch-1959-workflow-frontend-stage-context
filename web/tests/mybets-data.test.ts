import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import {
  decodeEventLog,
  encodeAbiParameters,
  encodeEventTopics,
  getAbiItem,
  pad,
  toHex,
  type Address,
  type Abi,
} from "viem";
import { mainnet } from "viem/chains";
import {
  betsFromEvents,
  loadMyBets,
  loadEvents,
  loadWalletBets,
  walletEvents,
  GAME_LOG_RPCS,
  type GameEvent,
} from "../src/data";
import { classify } from "../src/mybets";
import type { Runtime } from "../src/config";

const abi: Abi = JSON.parse(
  await readFile(
    new URL("../contracts/HamsterHour.json", import.meta.url),
    "utf8",
  ),
);
const handoff = JSON.parse(
  await readFile(
    new URL("../deployment/handoff.json", import.meta.url),
    "utf8",
  ),
);
const account: Address = "0xa1c19314851e7abf72b3c124476b1c7a3be2217a";
const other: Address = "0x15e02b8fa7fc6abcf698955587701fe51ddfe217";
const W = 10n ** 18n,
  genesis = 1791847200n,
  timeout = 172800n;
const event = (
  eventName: string,
  args: Record<string, any>,
  index = 0,
): GameEvent => ({
  eventName,
  args,
  transactionHash: "0x" + (index + 1).toString(16).padStart(64, "0"),
  blockNumber: 26230000n + BigInt(index),
  logIndex: index,
});
function runtime(client: unknown, urls: string[] = []): Runtime {
  return {
    chain: mainnet,
    game: { ...handoff.contracts[0], abi },
    client,
    deployment: { network: { rpcUrls: urls } },
  } as unknown as Runtime;
}
function readClient(stake: bigint, k: bigint, calls: any[]) {
  const endsAt = genesis + (k + 1n) * 3600n;
  const latest = 26330000n;
  return {
    getBlock: async () => ({
      number: latest,
      timestamp: endsAt + timeout + 1n,
    }),
    getLogs: () => {
      throw Error("Unexpected wallet scan");
    },
    getBlockNumber: () => {
      throw Error("Unexpected wallet head read");
    },
    request: () => {
      throw Error("Unexpected RPC request");
    },
    readContract: async (call: any) => {
      calls.push(call);
      assert.equal(call.blockNumber, latest);
      if (call.functionName === "TIMEOUT") return timeout;
      if (call.functionName === "balances") return 3n * W;
      if (call.functionName === "windowEnd") return endsAt;
      if (call.functionName === "claimable") return stake;
      if (call.functionName === "lossOf") return 0n;
      if (call.functionName === "position")
        return {
          over: 0n,
          under: 0n,
          yes: stake,
          no: 0n,
          paid: 0n,
          hasTicket: false,
          jackpotPaid: false,
          guess: 0n,
        };
      if (call.functionName === "windowInfo")
        return {
          index: k,
          status: 3,
          startsAt: endsAt - 3600n,
          endsAt,
          closesAt: endsAt - 3600n,
          timeoutAt: endsAt + timeout,
          over: 0n,
          under: 0n,
          yes: stake,
          no: 0n,
        };
      throw Error(`Unexpected read ${call.functionName}`);
    },
  };
}

test("shared events filter bettor and Claimed.account case-insensitively, keeping every stake", () => {
  const shared = [
    event("BinaryBet", {
      k: 429n,
      bettor: account.toUpperCase(),
      market: 1,
      side: true,
      amount: W,
    }),
    event("TicketBought", { k: 431n, bettor: account, guess: 1234n }, 1),
    event("Claimed", { k: 429n, account }, 2),
    event(
      "BinaryBet",
      { k: 429n, bettor: other, market: 1, side: false, amount: W },
      3,
    ),
    event("Claimed", { k: 431n, account: other, bettor: account }, 4),
    event("Fed", { k: 431n, bettor: account, from: account, amount: W }, 5),
  ];
  const own = walletEvents(shared, account);
  assert.equal(own.length, 3);
  assert.equal(shared.length, 6);
  const result = betsFromEvents(own);
  assert.deepEqual(
    result.bets.map((b) => b.kind),
    ["binary", "ticket"],
  );
  assert.equal(result.bets[1].amount, 5n * W);
  assert.deepEqual([...result.claimed], ["429"]);
  assert.equal(
    betsFromEvents(walletEvents(shared.slice(0, 2), account)).claimed.size,
    0,
  );
});

test("loaded shared history makes no per-wallet logs request and preserves every block-pinned read", async () => {
  const fixture = JSON.parse(
    await readFile(
      new URL("fixtures/leaderboard-26314829.json", import.meta.url),
      "utf8",
    ),
  );
  const events: GameEvent[] = fixture.logs.map((log: any) => {
    const decoded = decodeEventLog({ abi, data: log.data, topics: log.topics });
    return {
      ...log,
      ...decoded,
      blockNumber: BigInt(log.blockNumber),
      logIndex: Number(log.logIndex),
    };
  });
  const own = betsFromEvents(walletEvents(events, account));
  const stake = own.bets.reduce((n, b) => n + b.amount, 0n);
  assert.equal(stake, 7374185066434527746n);
  const calls: any[] = [];
  const result = await loadMyBets(
    runtime(readClient(stake, 429n, calls)),
    account,
    events,
  );
  assert.equal(result.balance, 3n * W);
  assert.equal(result.reads.length, 1);
  assert.equal(result.reads[0].unlockAt, genesis + 430n * 3600n + timeout);
  assert.deepEqual(
    calls.map((c) => c.functionName).sort(),
    [
      "TIMEOUT",
      "balances",
      "windowInfo",
      "position",
      "claimable",
      "windowEnd",
      "lossOf",
    ].sort(),
  );
  const rows = classify(result.bets, result.reads, result.timestamp);
  assert.equal(rows[0].k, 429n);
  assert.equal(rows[0].staked, stake);
  assert.ok(rows[0].bets.every((b) => b.label === "Refund ready"));
});

test("successful empty shared events are an empty wallet, never a reason to scan", async () => {
  const calls: any[] = [];
  const result = await loadMyBets(
    runtime(readClient(0n, 429n, calls)),
    account,
    [],
  );
  assert.equal(result.bets.length, 0);
  assert.deepEqual(calls.map((c) => c.functionName).sort(), [
    "TIMEOUT",
    "balances",
  ]);
});

async function rpcServers(
  handler: (rpc: number, body: any) => unknown | Promise<unknown>,
) {
  const servers = [0, 1].map((rpc) =>
    createServer(async (req, res) => {
      let text = "";
      for await (const chunk of req) text += chunk;
      const body = JSON.parse(text);
      try {
        const result = await handler(rpc, body);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
      } catch (error) {
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            error: { code: -32000, message: String(error) },
          }),
        );
      }
    }),
  );
  await Promise.all(
    servers.map(
      (s) => new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve)),
    ),
  );
  const urls = servers.map(
    (s) => `http://127.0.0.1:${(s.address() as any).port}`,
  );
  return {
    urls,
    close: () =>
      Promise.all(
        servers.map(
          (s) => new Promise<void>((resolve) => s.close(() => resolve())),
        ),
      ),
  };
}
function rawLog(
  name: string,
  args: Record<string, any>,
  block: bigint,
  index = 0,
) {
  const item = getAbiItem({ abi, name }) as any;
  const inputs = item.inputs.filter((input: any) => !input.indexed);
  return {
    address: handoff.contracts[0].address,
    topics: encodeEventTopics({ abi, eventName: name, args } as any),
    data: encodeAbiParameters(
      inputs,
      inputs.map((input: any) => args[input.name]),
    ),
    blockNumber: toHex(block),
    logIndex: toHex(index),
    transactionIndex: "0x0",
    removed: false,
    blockHash: "0x" + "a".repeat(64),
    transactionHash: "0x" + "b".repeat(64),
  };
}

test("fallback rotates RPCs, retries each fixed chunk and covers deployment to pinned latest", async (t) => {
  const logs: any[] = [],
    failures: any[] = [];
  t.mock.method(console, "error", (...args: any[]) => failures.push(args));
  const start = BigInt(handoff.contracts[0].deploymentBlock),
    latest = start + 10002n;
  let temporaryFailure = true;
  const rpc = await rpcServers((rpc, body) => {
    if (body.method === "eth_blockNumber") return toHex(latest);
    assert.equal(body.method, "eth_getLogs");
    const filter = body.params[0];
    logs.push({ rpc, ...filter });
    const from = BigInt(filter.fromBlock),
      to = BigInt(filter.toBlock);
    assert.ok(to - from + 1n <= 5000n);
    assert.equal(filter.topics[2], pad(account));
    assert.equal(filter.topics[0].length, 3);
    if (rpc === 0) throw Error("Archive requests require a personal token");
    if (temporaryFailure) {
      temporaryFailure = false;
      throw Error("Transient failure");
    }
    return from === start
      ? [
          rawLog(
            "BinaryBet",
            { k: 429n, bettor: account, market: 1, side: true, amount: W },
            from,
          ),
        ]
      : from === start + 10000n
        ? [rawLog("Claimed", { k: 429n, account, amount: W }, to)]
        : [];
  });
  try {
    const result = betsFromEvents(
      await loadWalletBets(runtime({}), account, rpc.urls),
    );
    assert.equal(result.bets.length, 1);
    assert.deepEqual([...result.claimed], ["429"]);
    const ranges = [
      ...new Set(
        logs.map((l) => `${BigInt(l.fromBlock)}-${BigInt(l.toBlock)}`),
      ),
    ];
    assert.deepEqual(ranges, [
      `${start}-${start + 4999n}`,
      `${start + 5000n}-${start + 9999n}`,
      `${start + 10000n}-${latest}`,
    ]);
    // The refusing RPC is tried, the transient failure is retried on the
    // same chunk, and the working RPC then stays preferred for later chunks.
    assert.deepEqual(
      logs.map((l) => l.rpc),
      [0, 1, 0, 1, 1, 1],
    );
    assert.ok(failures.length >= 2);
    const detail = failures[0][1];
    assert.equal(detail.step, "eth_getLogs");
    assert.equal(detail.rpcUrl, rpc.urls[0]);
    assert.equal(detail.fromBlock, String(start));
    assert.equal(detail.toBlock, String(start + 4999n));
  } finally {
    await rpc.close();
  }
});

test("exhausted chunk retries reject without returning partial history", async (t) => {
  const errors: any[] = [];
  t.mock.method(console, "error", (...args: any[]) => errors.push(args));
  const start = BigInt(handoff.contracts[0].deploymentBlock),
    latest = start + 5000n;
  let attempts = 0;
  const rpc = await rpcServers((_rpc, body) => {
    if (body.method === "eth_blockNumber") return toHex(latest);
    if (BigInt(body.params[0].fromBlock) === start) return [];
    attempts++;
    throw Error("RPC offline");
  });
  try {
    await assert.rejects(
      loadWalletBets(runtime({}), account, rpc.urls),
      /RPC offline/,
    );
    assert.equal(attempts, 4);
    assert.equal(errors.length, 4);
    assert.ok(
      errors.every(
        (e) =>
          e[1].fromBlock === String(latest) && e[1].toBlock === String(latest),
      ),
    );
  } finally {
    await rpc.close();
  }
});

test("per-hour errors identify the read, RPC URL and pinned block", async (t) => {
  const errors: any[] = [];
  t.mock.method(console, "error", (...args: any[]) => errors.push(args));
  const client = readClient(W, 429n, []);
  const normal = client.readContract;
  client.readContract = async (call) => {
    if (call.functionName === "position")
      throw { cause: { url: "https://eth.drpc.org", message: "offline" } };
    return normal(call);
  };
  await assert.rejects(
    loadMyBets(runtime(client), account, [
      event("BinaryBet", {
        k: 429n,
        bettor: account,
        market: 1,
        side: true,
        amount: W,
      }),
    ]),
  );
  assert.equal(errors[0][1].step, `position(429, ${account})`);
  assert.equal(errors[0][1].rpcUrl, "https://eth.drpc.org");
  assert.equal(errors[0][1].fromBlock, "26330000");
  assert.equal(errors[0][1].toBlock, "26330000");
});

test("shared events load through the leaderboard RPC list in 5000-block chunks past refusing RPCs", async (t) => {
  const failures: any[] = [];
  t.mock.method(console, "error", (...args: any[]) => failures.push(args));
  const { LEADERBOARD_RPCS } = await import("../src/leaderboard-config");
  assert.deepEqual(GAME_LOG_RPCS, LEADERBOARD_RPCS);
  const start = BigInt(handoff.contracts[0].deploymentBlock),
    latest = start + 7000n;
  const ranges: string[] = [];
  const rpc = await rpcServers((rpc, body) => {
    if (body.method === "eth_blockNumber") return toHex(latest);
    const from = BigInt(body.params[0].fromBlock),
      to = BigInt(body.params[0].toBlock);
    assert.ok(to - from + 1n <= 5000n);
    // Mirrors publicnode's refusal of the deployment-era range.
    if (rpc === 0)
      throw Error(
        "Archive requests require a personal token. Get one at: https://www.allnodes.com/publicnode",
      );
    ranges.push(`${from}-${to}`);
    return from === start
      ? [
          rawLog(
            "BinaryBet",
            { k: 429n, bettor: account, market: 1, side: true, amount: W },
            from,
          ),
          rawLog(
            "BinaryBet",
            { k: 429n, bettor: other, market: 1, side: false, amount: W },
            from,
            1,
          ),
        ]
      : [rawLog("Claimed", { k: 429n, account, amount: W }, to, 2)];
  });
  try {
    const r = runtime({
      getLogs: () => {
        throw Error("Game logs must not use the wallet transport");
      },
    });
    const events = await loadEvents(r, undefined, rpc.urls);
    assert.deepEqual(ranges, [
      `${start}-${start + 4999n}`,
      `${start + 5000n}-${latest}`,
    ]);
    assert.equal(events.length, 3);
    const own = betsFromEvents(walletEvents(events, account));
    assert.equal(own.bets.length, 1);
    assert.deepEqual([...own.claimed], ["429"]);
    const detail = failures[0][1];
    assert.equal(detail.step, "shared events: eth_getLogs");
    assert.equal(detail.rpcUrl, rpc.urls[0]);
    assert.equal(detail.fromBlock, String(start));
    assert.equal(detail.toBlock, String(start + 4999n));
  } finally {
    await rpc.close();
  }
});
