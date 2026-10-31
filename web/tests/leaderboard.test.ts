import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  encodeAbiParameters,
  encodeEventTopics,
  getEventSelector,
  parseAbi,
  toHex,
  type AbiEvent,
  type Address,
  type Hex,
} from "viem";
import {
  aggregateEvents,
  createRpcPool,
  decodeVolumeEvent,
  rankWallets,
  walletVolumes,
  volumeImd,
  VolumeScanner,
  type RawVolumeLog,
  type RpcCall,
} from "../src/leaderboard";
import {
  LEADERBOARD_EVENTS,
  LEADERBOARD_TICKET_PRICE,
  LEADERBOARD_TEAM,
  LEADERBOARD_CACHE_VERSION,
} from "../src/leaderboard-config";

const game: Address = "0xe33ab493249a2df0d8c4a71ac54f46d1f7778367";
const alice: Address = "0x1111111111111111111111111111111111111111";
const bob: Address = "0x2222222222222222222222222222222222222222";
const W = 10n ** 18n;
const hash = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const signal = () => new AbortController().signal;
const fixtureEvents = [
  ...LEADERBOARD_EVENTS,
  ...parseAbi(["event MarketVoided(uint256 indexed k, uint8 indexed market)"]),
];
function event(
  name: "BinaryBet" | "TicketBought" | "Settled" | "MarketVoided" | "TimedOut",
  args: Record<string, any>,
  block: bigint,
  index = 0,
): RawVolumeLog {
  const item = fixtureEvents.find(
    (e) => e.type === "event" && e.name === name,
  ) as AbiEvent;
  const plain = item.inputs.filter((x) => !x.indexed);
  return {
    address: game,
    topics: encodeEventTopics({
      abi: fixtureEvents,
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
  side = true,
  market = 0,
) =>
  event(
    "BinaryBet",
    { k: hour, bettor: who, market, side, amount },
    block,
    index,
  );
const ticket = (who = alice, block = 101n, hour = 1n) =>
  event("TicketBought", { k: hour, bettor: who, guess: 0n }, block);
const settled = (hour = 1n, block = 102n) =>
  event(
    "Settled",
    {
      k: hour,
      result: 1000n,
      requestId: hash(hour),
      settler: bob,
    },
    block,
  );
const decode = (logs: RawVolumeLog[]) =>
  logs
    .filter((l) =>
      LEADERBOARD_EVENTS.some((e) => getEventSelector(e) === l.topics[0]),
    )
    .map((l) =>
      decodeVolumeEvent(LEADERBOARD_EVENTS, l, LEADERBOARD_TICKET_PRICE),
    );
const totals = (logs: RawVolumeLog[]) =>
  walletVolumes(aggregateEvents(decode(logs)));
function harness() {
  let head = 4_102n,
    failAt: bigint | undefined,
    reorg = false;
  const logs = [
    binary(),
    ticket(),
    binary(bob, 2_100n, 12n * W, 1n, 0, false),
    binary(alice, 4_100n, 3n * W, 2n),
    binary(bob, 4_100n, W, 2n, 1, false),
    settled(),
    settled(2n, 4101n),
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
      assert.equal(p.topics[0].length, 4);
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
        decodeVolumeEvent(LEADERBOARD_EVENTS, l, LEADERBOARD_TICKET_PRICE),
      rpc,
      storage,
      cacheVersion: LEADERBOARD_CACHE_VERSION,
      excludedAddresses: [LEADERBOARD_TEAM],
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
  events.push(settled(1n, 104n), settled(2n, 105n));
  events.push(
    binary(bob, 103n, W, 1n, 1, false),
    binary(bob, 103n, W, 2n, 2, false),
    binary(bob, 103n, W, 2n, 3, true, 1),
  );
  const w = rankWallets(totals(events))[0];
  assert.equal(w.volume, 22n * W);
  assert.equal(w.bets, 4);
  assert.equal(w.tickets, 1);
  assert.deepEqual([...w.hours], ["1", "2"]);
});
test("sorting is exact above Number precision, deterministic for ties, and retains ranks below 50", () => {
  const rows = rankWallets(
    walletVolumes(
      aggregateEvents([
        ...Array.from({ length: 60 }, (_, i) => ({
          type: "bet" as const,
          market: 0,
          side: i % 2 === 0,
          bettor: `0x${(i + 1).toString(16).padStart(40, "0")}` as Address,
          hour: 0n,
          ticket: false as const,
          amount: 2n ** 100n + BigInt(i === 59 ? 1 : 0),
        })),
        { type: "settled", hour: 0n },
      ]),
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
  assert.equal(updated.rows.find((w) => w.address === bob)!.volume, 18n * W);
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
    decode: (l) => decodeVolumeEvent(LEADERBOARD_EVENTS, l, 5n * W),
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
      decode: (l) => decodeVolumeEvent(LEADERBOARD_EVENTS, l, 5n * W),
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
    decode: (l) => decodeVolumeEvent(LEADERBOARD_EVENTS, l, 5n * W),
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
  h.logs.push(binary(bob, 103n, W, 1n, 1, false));
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
    decode: (l) => decodeVolumeEvent(LEADERBOARD_EVENTS, l, 5n * W),
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

test("one-sided refunds never count without MarketVoided, even after settlement", () => {
  for (const side of [true, false]) {
    const logs = [binary(alice, 100n, (737n * W) / 100n, 429n, 0, side, 1)];
    assert.equal(totals(logs).has(alice), false, "one-sided is not pending");
    logs.push(settled(429n, 101n));
    assert.deepEqual(rankWallets(totals(logs)), []);
    assert.equal(totals(logs).has(alice), false, "refunded wallet is excluded");
    // A lazy void emitted on the first claim must not change the board.
    logs.push(event("MarketVoided", { k: 429n, market: 1 }, 102n));
    assert.deepEqual(rankWallets(totals(logs)), []);
  }
});

test("positive stake on BOTH sides is required in the SAME window and market", () => {
  const logs = [
    binary(alice, 100n, 7n * W, 1n),
    binary(bob, 101n, 9n * W, 1n, 0, false, 1),
    binary(bob, 102n, 11n * W, 2n, 0, false),
    binary(bob, 103n, 0n, 1n, 0, false),
    settled(1n, 104n),
    settled(2n, 105n),
  ];
  assert.deepEqual(rankWallets(totals(logs)), []);
  logs.push(binary(bob, 106n, W, 1n, 0, false));
  assert.equal(totals(logs).get(alice)!.volume, 7n * W);
  assert.equal(totals(logs).get(bob)!.volume, W);
});

test("two-sided pending, settled EXACT, timeouts and mixed markets classify independently of log order", () => {
  const logs = [
    binary(alice, 100n, 11n * W, 1n), // refund: no counterparty in market 0
    binary(alice, 101n, 7n * W, 1n, 0, false, 1),
    binary(bob, 101n, W, 1n, 1, true, 1),
    ticket(alice, 102n, 1n),
    settled(1n, 103n),
    binary(alice, 104n, 13n * W, 2n),
    binary(bob, 104n, W, 2n, 1, false),
    ticket(alice, 105n, 2n),
    event("TimedOut", { k: 2n }, 106n),
    settled(2n, 107n), // timeout takes precedence, including EXACT
    binary(alice, 108n, 17n * W, 3n),
    binary(bob, 108n, W, 3n, 1, false),
    ticket(alice, 109n, 3n),
    binary(alice, 110n, 19n * W, 4n),
    binary(bob, 110n, W, 4n, 1, false),
    settled(4n, 111n),
    event("MarketVoided", { k: 1n, market: 0 }, 112n),
  ];
  for (const order of [logs, [...logs].reverse()]) {
    const w = totals(order).get(alice)!;
    assert.equal(w.volume, 31n * W);
    assert.equal(w.pending, 22n * W);
    assert.equal(w.bets, 3);
    assert.equal(w.tickets, 1);
    assert.deepEqual([...w.hours].sort(), ["1", "4"]);
  }
});

test("one wallet can take both sides; multiple bets sum exactly and count once per event", () => {
  const windows = aggregateEvents(
    decode([
      binary(alice, 100n, W),
      binary(alice, 101n, 2n * W),
      binary(alice, 102n, 3n * W, 1n, 0, false),
      settled(),
    ]),
  );
  const w = walletVolumes(windows).get(alice)!;
  assert.equal(w.volume, 6n * W);
  assert.equal(w.bets, 3);
  assert.equal(w.hours.size, 1);
  assert.equal(w.tickets, 0);
});

test("EXACT is independent of binary counterparties and counts only after non-timeout settlement", () => {
  const logs = [binary(), ticket()];
  assert.equal(totals(logs).get(alice)!.pending, 5n * W);
  logs.push(settled());
  assert.equal(totals(logs).get(alice)!.volume, 5n * W);
  assert.equal(totals(logs).get(alice)!.bets, 1);
  logs.push(event("TimedOut", { k: 1n }, 103n));
  assert.equal(totals(logs).has(alice), false);
});

test("side totals survive chunks and reload: one-sided -> two-sided pending -> counted", async () => {
  const h = harness();
  h.logs.splice(0, h.logs.length, binary(), ticket());
  h.setHead(101n);
  const initial = await h.make().scan(signal());
  assert.deepEqual(initial.rows, []);
  assert.equal(initial.unranked[0].pending, 5n * W);
  h.logs.push(binary(bob, 102n, 9n * W, 1n, 1, false));
  h.setHead(102n);
  const reloaded = h.make();
  assert.equal(reloaded.snapshot()!.unranked[0].pending, 5n * W);
  const pending = await reloaded.scan(signal());
  assert.equal(
    pending.unranked.find((w) => w.address === alice)!.pending,
    17n * W,
  );
  assert.equal(
    pending.unranked.find((w) => w.address === bob)!.pending,
    9n * W,
  );
  assert.deepEqual(h.make().snapshot()!.unranked, pending.unranked);
  h.ranges.length = 0;
  h.logs.push(settled(1n, 103n));
  h.setHead(103n);
  const result = await h.make().scan(signal());
  assert.deepEqual(h.ranges, [[103n, 103n]]);
  assert.equal(result.rows[0].volume, 17n * W);
  assert.equal(result.rows[0].pending, 0n);
  assert.equal(result.rows[0].bets, 2);
  assert.equal(result.rows[0].hours.size, 1);
  assert.equal(result.rows[1].volume, 9n * W);
  assert.deepEqual((await h.make().scan(signal())).rows, result.rows);
});

test("a later timeout removes cached two-sided volume and EXACT, including after reload", async () => {
  const h = harness();
  await h.make().scan(signal());
  h.logs.push(event("TimedOut", { k: 1n }, 4103n));
  h.setHead(4103n);
  const result = await h.make().scan(signal());
  assert.equal(result.rows[0].volume, 3n * W);
  assert.equal(result.rows[0].tickets, 0);
  assert.deepEqual([...result.rows[0].hours], ["2"]);
  assert.deepEqual(h.make().snapshot()!.rows, result.rows);
});

test("team is never ranked but its counterparty stake makes a market two-sided", async () => {
  const h = harness();
  h.logs.splice(
    0,
    h.logs.length,
    binary(alice, 100n, 5n * W),
    binary(LEADERBOARD_TEAM, 101n, 1000n * W, 1n, 0, false),
    settled(),
    binary(bob, 103n, 7n * W, 2n), // one-sided pending is hidden
  );
  const result = await h.make().scan(signal());
  assert.deepEqual(
    result.rows.map((w) => w.address),
    [alice],
  );
  assert.equal(result.rows[0].rank, 1);
  const team = result.unranked.find((w) => w.address === LEADERBOARD_TEAM)!;
  assert.equal(team.volume, 1000n * W);
  assert.equal("rank" in team, false);
  assert.equal(
    result.unranked.some((w) => w.address === bob),
    false,
  );
  assert.deepEqual(
    rankWallets(totals(h.logs), [
      LEADERBOARD_TEAM.toUpperCase() as Address,
    ]).map((w) => w.address),
    [alice],
  );
});

test("previous no-side caches are ignored; malformed side checkpoints restart the scan", async () => {
  const h = harness();
  const scanner = h.make();
  await scanner.scan(signal());
  const saved = h.memory.get(scanner.key)!;
  for (const version of ["v1-ticket-5-imd", "v2-played-ticket-5-imd"]) {
    h.memory.clear();
    h.memory.set(
      scanner.key.replace(LEADERBOARD_CACHE_VERSION, version),
      saved,
    );
    assert.equal(h.make().snapshot(), undefined);
  }
  for (const mutate of [
    (d: any) => {
      d.windows[0].settled = "true";
    },
    (d: any) => {
      delete d.windows[0].stakes[0].side;
    },
    (d: any) => {
      d.windows[0].stakes[0].side = "false";
    },
    (d: any) => {
      d.windows[0].stakes[1].side = true;
    }, // ticket must use null
    (d: any) => {
      d.windows[0].stakes[0].volume = "-1";
    },
    (d: any) => {
      d.windows[0].stakes[0].market = 256;
    },
    (d: any) => {
      d.windows[0].stakes[0].bets = 0;
    },
    (d: any) => {
      d.windows.push(d.windows[0]);
    },
    (d: any) => {
      d.windows[0].stakes.push(d.windows[0].stakes[0]);
    },
  ]) {
    const data = JSON.parse(saved);
    mutate(data);
    h.memory.set(scanner.key, JSON.stringify(data));
    assert.equal(h.make().snapshot(), undefined);
  }
});

test("failed settlement range preserves pending and both sides until recovery", async () => {
  const h = harness();
  h.logs.splice(
    0,
    h.logs.length,
    binary(),
    ticket(),
    binary(bob, 101n, W, 1n, 1, false),
  );
  h.setHead(101n);
  const scanner = h.make();
  await scanner.scan(signal());
  const before = h.memory.get(scanner.key);
  h.logs.push(settled(), { ...settled(2n, 103n), data: "0x" });
  h.setHead(103n);
  await assert.rejects(scanner.scan(signal()));
  assert.equal(h.memory.get(scanner.key), before);
  assert.equal(scanner.snapshot()!.unranked[0].pending, 17n * W);
  h.logs.pop();
  assert.equal((await scanner.scan(signal())).rows[0].volume, 17n * W);
});

test("aggregation keeps previous side totals immutable and does not depend on event order", () => {
  const before = aggregateEvents(decode([binary(), ticket()]));
  const next = decode([binary(bob, 102n, W, 1n, 1, false), settled(1n, 103n)]);
  const after = aggregateEvents(next, before);
  assert.equal(walletVolumes(before).get(alice)!.pending, 5n * W);
  assert.equal(before.get("1")!.settled, false);
  assert.equal(before.get("1")!.stakes.size, 2);
  assert.equal(walletVolumes(after).get(alice)!.volume, 17n * W);
  assert.deepEqual(
    walletVolumes(aggregateEvents([...next].reverse(), before)),
    walletVolumes(after),
  );
});

test("all four scanner events match the unchanged v2 contract ABI including indexed fields", () => {
  const abi = JSON.parse(
    readFileSync(
      new URL("../contracts/HamsterHour.json", import.meta.url),
      "utf8",
    ),
  );
  const canonicalInputs = (event: AbiEvent) =>
    event.inputs.map(({ name, type, indexed }) => ({
      name,
      type,
      indexed: !!indexed,
    }));
  for (const event of LEADERBOARD_EVENTS) {
    if (event.type !== "event") continue;
    const pinned = abi.find(
      (e: AbiEvent) => e.type === "event" && e.name === event.name,
    );
    assert.ok(pinned);
    assert.equal(getEventSelector(event), getEventSelector(pinned));
    assert.deepEqual(canonicalInputs(event), canonicalInputs(pinned));
  }
});

test("recorded Ethereum events reproduce the three expected wallets and exclude the lazy SNOOZE refund", () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL("./fixtures/leaderboard-26314829.json", import.meta.url),
      "utf8",
    ),
  );
  const wallets = totals(fixture.logs);
  const rows = rankWallets(wallets, [LEADERBOARD_TEAM]);
  assert.deepEqual(
    rows.map((w) => [w.address, w.volume, w.tickets, [...w.hours]]),
    [
      ["0x2300878c6e8fc1706cabdf86f3d70f909bf572f1", 5n * W, 1, ["429"]],
      ["0xc6579c593b34916fcc7f3f2750e8b56749bf0808", 5n * W, 0, ["440"]],
      ["0xdc8a2958f8b8a07a9609d6f4cb4d35f3b5856c26", 4n * W, 0, ["440"]],
    ],
  );
  assert.equal(
    wallets.has("0xa1c19314851e7abf72b3c124476b1c7a3be2217a"),
    false,
  );
  assert.equal(
    rows.some((w) => w.pending > 0n),
    false,
  );
});
