import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeAbiParameters,
  encodeEventTopics,
  toHex,
  type AbiEvent,
  type Address,
  type Hex,
} from "viem";
import {
  aggregateBets,
  createRpcPool,
  decodeVolumeBet,
  rankWallets,
  volumeImd,
  VolumeScanner,
  type RawVolumeLog,
  type RpcCall,
} from "../src/leaderboard";
import {
  LEADERBOARD_EVENTS,
  LEADERBOARD_TICKET_PRICE,
} from "../src/leaderboard-config";

const game: Address = "0xe33ab493249a2df0d8c4a71ac54f46d1f7778367";
const alice: Address = "0x1111111111111111111111111111111111111111";
const bob: Address = "0x2222222222222222222222222222222222222222";
const W = 10n ** 18n;
const hash = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const signal = () => new AbortController().signal;
function event(
  name: "BinaryBet" | "TicketBought",
  args: Record<string, any>,
  block: bigint,
  index = 0,
): RawVolumeLog {
  const item = LEADERBOARD_EVENTS.find(
    (e) => e.type === "event" && e.name === name,
  ) as AbiEvent;
  const plain = item.inputs.filter((x) => !x.indexed);
  return {
    address: game,
    topics: encodeEventTopics({
      abi: LEADERBOARD_EVENTS,
      eventName: name,
      args,
    } as any) as Hex[],
    data: encodeAbiParameters(plain, plain.map((x) => args[x.name!]) as any),
    blockNumber: toHex(block),
    blockHash: hash(block),
    transactionHash: hash(block * 100n + BigInt(index)),
    logIndex: toHex(index),
    removed: false,
  };
}
const binary = (
  who = alice,
  block = 100n,
  amount = 12n * W,
  hour = 1n,
  index = 0,
) =>
  event(
    "BinaryBet",
    { k: hour, bettor: who, market: 0, side: true, amount },
    block,
    index,
  );
const ticket = (who = alice, block = 101n, hour = 1n) =>
  event("TicketBought", { k: hour, bettor: who, guess: 0n }, block);
function harness() {
  let head = 4_102n,
    failAt: bigint | undefined,
    reorg = false;
  const logs = [
    binary(),
    ticket(),
    binary(bob, 2_100n),
    binary(alice, 4_100n, 3n * W, 2n),
  ];
  const ranges: [bigint, bigint][] = [],
    memory = new Map<string, string>();
  const rpc: RpcCall = async <T>(method: string, params: unknown[]) => {
    if (method === "eth_blockNumber") return toHex(head) as T;
    if (method === "eth_getBlockByNumber") {
      const n = BigInt(params[0] as string);
      return { number: toHex(n), hash: hash(reorg ? n + 1n : n) } as T;
    }
    if (method === "eth_getLogs") {
      const p = params[0] as any,
        from = BigInt(p.fromBlock),
        to = BigInt(p.toBlock);
      ranges.push([from, to]);
      assert.ok(to - from + 1n <= 2_000n);
      assert.equal(p.address, game);
      assert.equal(p.topics[0].length, 2);
      if (failAt !== undefined && from >= failAt) throw Error("Disconnected");
      return logs.filter(
        (l) => BigInt(l.blockNumber) >= from && BigInt(l.blockNumber) <= to,
      ) as T;
    }
    throw Error(`Unexpected method ${method}`);
  };
  const storage = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memory.set(k, v);
    },
  };
  const make = () =>
    new VolumeScanner({
      chainId: 1,
      address: game,
      deploymentBlock: 100n,
      abi: LEADERBOARD_EVENTS,
      decode: (l) =>
        decodeVolumeBet(LEADERBOARD_EVENTS, l, LEADERBOARD_TICKET_PRICE),
      rpc,
      storage,
      cacheVersion: "test",
    });
  return {
    make,
    logs,
    ranges,
    memory,
    storage,
    rpc,
    setHead: (n: bigint) => {
      head = n;
    },
    setFailure: (n?: bigint) => {
      failAt = n;
    },
    reorg: () => {
      reorg = true;
      logs.splice(0);
    },
  };
}

test("event decoding counts full binary stake, fixed 5 IMD tickets, distinct hours and all markets", () => {
  const events = [
    binary(),
    ticket(),
    binary(alice, 102n, 3n * W, 2n),
    event(
      "BinaryBet",
      { k: 2n, bettor: alice, market: 1, side: false, amount: 2n * W },
      103n,
    ),
  ];
  const w = rankWallets(
    aggregateBets(
      events.map((e) => decodeVolumeBet(LEADERBOARD_EVENTS, e, 5n * W)),
    ),
  )[0];
  assert.equal(w.volume, 22n * W);
  assert.equal(w.bets, 4);
  assert.equal(w.tickets, 1);
  assert.deepEqual([...w.hours], ["1", "2"]);
});
test("sorting is exact above Number precision, deterministic for ties, and retains ranks below 50", () => {
  const rows = rankWallets(
    aggregateBets(
      Array.from({ length: 60 }, (_, i) => ({
        bettor: `0x${(i + 1).toString(16).padStart(40, "0")}` as Address,
        hour: 0n,
        ticket: false,
        amount: 2n ** 100n + BigInt(i === 59 ? 1 : 0),
      })),
    ),
  );
  assert.equal(rows[0].address, "0x000000000000000000000000000000000000003c");
  assert.equal(rows[1].address, "0x0000000000000000000000000000000000000001");
  assert.equal(rows[59].rank, 60);
  assert.equal(
    volumeImd(123456789123456789500000000000000000n),
    "123,456,789,123,456,789.50",
  );
  assert.equal(volumeImd(1_005_000_000_000_000_000n), "1.01");
  assert.equal(volumeImd(0n), "0.00");
});
test("chunk boundaries are inclusive without overlap, cache resumes only new blocks, duplicates count once", async () => {
  const h = harness();
  h.logs.push(h.logs[0]);
  const progress: bigint[] = [];
  const result = await h.make().scan(signal(), (p) => progress.push(p.scanned));
  assert.deepEqual(h.ranges, [
    [100n, 2099n],
    [2100n, 4099n],
    [4100n, 4102n],
  ]);
  assert.equal(result.rows[0].volume, 20n * W);
  assert.equal(result.rows[0].hours.size, 2);
  assert.equal(progress.at(-1), 4003n);
  h.ranges.length = 0;
  h.setHead(4105n);
  h.logs.push(ticket(bob, 4103n, 2n));
  const reloaded = h.make();
  assert.equal(reloaded.snapshot()!.lastBlock, 4102n);
  const updated = await reloaded.scan(signal());
  assert.deepEqual(h.ranges, [[4103n, 4105n]]);
  assert.equal(updated.rows.find((w) => w.address === bob)!.volume, 17n * W);
  assert.equal(updated.rows[0].volume, 20n * W);
  h.ranges.length = 0;
  await reloaded.scan(signal());
  assert.deepEqual(h.ranges, []);
});
test("interrupted initial scan persists completed ranges and never exposes partial rankings", async () => {
  const h = harness();
  h.setFailure(2100n);
  const first = h.make();
  await assert.rejects(first.scan(signal()), /Disconnected/);
  assert.equal(first.snapshot(), undefined);
  assert.equal(JSON.parse([...h.memory.values()][0]).lastBlock, "2099");
  h.ranges.length = 0;
  h.setFailure();
  const resumed = h.make();
  assert.equal(resumed.snapshot(), undefined);
  assert.equal((await resumed.scan(signal())).rows[0].volume, 20n * W);
  assert.deepEqual(h.ranges, [
    [2100n, 4099n],
    [4100n, 4102n],
  ]);
});
test("cache corruption, chain reorg and unavailable storage recover through real scans", async () => {
  const h = harness();
  const scanner = h.make();
  await scanner.scan(signal());
  h.memory.set(scanner.key, '{"wallets":[]}');
  assert.equal(h.make().snapshot(), undefined);
  await scanner.scan(signal());
  h.reorg();
  h.ranges.length = 0;
  let reset = false;
  assert.deepEqual(
    (
      await scanner.scan(signal(), undefined, () => {
        reset = true;
      })
    ).rows,
    [],
  );
  assert.equal(reset, true);
  assert.equal(h.ranges[0][0], 100n);
  const noStorage = new VolumeScanner({
    chainId: 1,
    address: game,
    deploymentBlock: 100n,
    abi: LEADERBOARD_EVENTS,
    decode: (l) => decodeVolumeBet(LEADERBOARD_EVENTS, l, 5n * W),
    rpc: h.rpc,
    cacheVersion: "test",
    storage: {
      getItem: () => {
        throw Error("Blocked");
      },
      setItem: () => {
        throw Error("Quota");
      },
    },
  });
  assert.deepEqual((await noStorage.scan(signal())).rows, []);
  assert.equal(noStorage.cacheAvailable, false);
});
test("wrong contract, out-of-range, removed and malformed logs fail without advancing the checkpoint", async () => {
  for (const patch of [
    { address: bob },
    { blockNumber: toHex(1n) },
    { removed: true },
    { data: "0x" },
    { topics: [] },
  ]) {
    const h = harness();
    Object.assign(h.logs[0], patch);
    const rpc: RpcCall = async <T>(
      method: string,
      params: unknown[],
      s: AbortSignal,
    ) =>
      method === "eth_getLogs" ? (h.logs as T) : h.rpc<T>(method, params, s);
    const scanner = new VolumeScanner({
      chainId: 1,
      address: game,
      deploymentBlock: 100n,
      abi: LEADERBOARD_EVENTS,
      decode: (l) => decodeVolumeBet(LEADERBOARD_EVENTS, l, 5n * W),
      rpc,
      storage: h.storage,
      cacheVersion: "test",
    });
    await assert.rejects(scanner.scan(signal()));
    assert.equal(scanner.snapshot(), undefined);
    assert.equal(h.memory.size, 0);
  }
});

test("a reorg between chunks cannot mix old aggregates with a new canonical boundary", async () => {
  let reorganized = false;
  const rpc: RpcCall = async <T>(method: string, params: unknown[]) => {
    if (method === "eth_blockNumber") return toHex(4102n) as T;
    if (method === "eth_getLogs") return [] as T;
    const n = BigInt(params[0] as string);
    if (n === 4099n) reorganized = true;
    return { number: toHex(n), hash: hash(reorganized ? n + 1n : n) } as T;
  };
  const scanner = new VolumeScanner({
    chainId: 1,
    address: game,
    deploymentBlock: 100n,
    abi: LEADERBOARD_EVENTS,
    decode: (l) => decodeVolumeBet(LEADERBOARD_EVENTS, l, 5n * W),
    rpc,
    cacheVersion: "test",
  });
  await assert.rejects(scanner.scan(signal()), /Chain changed during scan/);
  assert.equal(scanner.snapshot(), undefined);
  let reset = false;
  assert.deepEqual(
    (
      await scanner.scan(signal(), undefined, () => {
        reset = true;
      })
    ).rows,
    [],
  );
  assert.equal(reset, true);
});
test("fallback retries HTTP/range errors and malformed responses; successful endpoint stays preferred", async () => {
  const visited: string[] = [];
  const rpc = createRpcPool(
    ["https://first.example", "https://second.example"],
    {
      retryDelayMs: 0,
      fetch: (async (url, init) => {
        visited.push(String(url));
        const body = JSON.parse(String(init!.body));
        if (String(url).includes("first"))
          return new Response("rate limited", { status: 429 });
        return Response.json({ jsonrpc: "2.0", id: body.id, result: "0x123" });
      }) as typeof fetch,
    },
  );
  assert.equal(await rpc("eth_blockNumber", [], signal()), "0x123");
  await rpc("eth_blockNumber", [], signal());
  assert.deepEqual(visited, [
    "https://first.example",
    "https://second.example",
    "https://second.example",
  ]);
  let tries = 0;
  const retry = createRpcPool(["https://first.example"], {
    retryDelayMs: 0,
    fetch: (async (_, init) => {
      tries++;
      const { id } = JSON.parse(String(init!.body));
      return Response.json(
        tries === 1
          ? { id, error: { code: -32005, message: "range refused" } }
          : { id, result: [] },
      );
    }) as typeof fetch,
  });
  assert.deepEqual(await retry("eth_getLogs", [], signal(), Array.isArray), []);
  assert.equal(tries, 2);
  let malformedAttempts = 0;
  const malformed = createRpcPool(["https://first.example"], {
    retryDelayMs: 0,
    fetch: (async (_, init) => {
      malformedAttempts++;
      const { id } = JSON.parse(String(init!.body));
      return Response.json({ id, result: malformedAttempts === 1 ? null : [] });
    }) as typeof fetch,
  });
  assert.deepEqual(
    await malformed("eth_getLogs", [], signal(), Array.isArray),
    [],
  );
  assert.equal(malformedAttempts, 2);
  const badRange = createRpcPool(["https://first.example"], {
    retryDelayMs: 0,
    fetch: (async (_, init) => {
      const { id } = JSON.parse(String(init!.body));
      return Response.json(
        { id, error: { code: -32005, message: "block range limit" } },
        { status: 400 },
      );
    }) as typeof fetch,
  });
  await assert.rejects(
    badRange("eth_getLogs", [], signal()),
    /block range limit/,
  );
});
test("all-provider range refusals subdivide without gaps; cancellation stops without fabricated empty data", async () => {
  const h = harness(),
    ranges: [bigint, bigint][] = [];
  h.setHead(107n);
  const rpc: RpcCall = async <T>(
    method: string,
    params: unknown[],
    s: AbortSignal,
    valid?: (v: unknown) => boolean,
  ) => {
    if (method === "eth_getLogs") {
      const p = params[0] as any,
        from = BigInt(p.fromBlock),
        to = BigInt(p.toBlock);
      if (to - from > 1n) throw Error("block range limit");
      ranges.push([from, to]);
    }
    return h.rpc<T>(method, params, s, valid);
  };
  const scanner = new VolumeScanner({
    chainId: 1,
    address: game,
    deploymentBlock: 100n,
    abi: LEADERBOARD_EVENTS,
    decode: (l) => decodeVolumeBet(LEADERBOARD_EVENTS, l, 5n * W),
    rpc,
    cacheVersion: "test",
  });
  assert.equal((await scanner.scan(signal())).rows[0].volume, 17n * W);
  assert.deepEqual(ranges, [
    [100n, 101n],
    [102n, 103n],
    [104n, 105n],
    [106n, 107n],
  ]);
  const c = new AbortController();
  c.abort();
  const pool = createRpcPool(["https://first.example"], {
    fetch: (() => {
      throw Error("must not fetch");
    }) as any,
  });
  await assert.rejects(pool("eth_blockNumber", [], c.signal));
});
