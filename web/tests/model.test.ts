import test from "node:test";
import assert from "node:assert/strict";
import { amountValue, payout, type GameWindow } from "../src/model";
import {
  parseLive,
  parseStatus,
  parseRounds,
  windowProgress,
} from "../src/live";
import { parseStats, hourly } from "../src/telemetry";
import { chatText, validateDraft, mergeMessages } from "../src/Chat";
const W = 10n ** 18n;
const window = {
  over: 10n * W,
  under: 10n * W,
  yes: 2n * W,
  no: 8n * W,
} as GameWindow;
test("amounts retain 18 decimals and enforce minimum, uint128 cap, and plain decimal syntax", () => {
  assert.equal(amountValue("0.500000000000000001", W / 2n), W / 2n + 1n);
  for (const v of [
    "-1",
    "1e6",
    "NaN",
    "",
    "0.499",
    "1.0000000000000000001",
    " 5 ",
    "340282366920938463463.374607431768211456",
  ])
    assert.throws(() => amountValue(v, W / 2n));
});
test("payout includes new stake, pool fees and dilution", () => {
  const p = payout(window, "over", 5n * W);
  assert.equal(p.amount, 7583333333333333333n);
  assert.equal(p.multiple, 1.51);
  assert.equal(p.refund, false);
});
test("one-sided binary pools preview a full refund with no fee", () => {
  const p = payout({ ...window, under: 0n }, "over", 5n * W);
  assert.deepEqual(p, { amount: 5n * W, multiple: 1, refund: true });
});
test("snooze yes and no are their own pools, never OVER/UNDER substitutes", () => {
  assert.equal(
    payout(window, "snooze", 2n * W, true).amount,
    5460000000000000000n,
  );
  assert.equal(
    payout(window, "snooze", 2n * W, false).amount,
    2184000000000000000n,
  );
});
test("status missing a counter is unknown, not zero live passes", () => {
  assert.equal(
    parseStatus({ measurement: { speedMmPerSecond: 0 } }).liveCounter,
    undefined,
  );
  assert.equal(
    parseStatus({ measurement: { cumulativeWorkUnits: "9007199254740993123" } })
      .liveCounter,
    9007199254740993123n,
  );
});
test("stream id and settlement parser reject unsupported input", () => {
  assert.equal(
    parseLive({
      state: "live",
      playback: { kind: "youtube", publicId: "BWkC7PAYORA" },
    }).publicId,
    "BWkC7PAYORA",
  );
  assert.equal(
    parseLive({ state: "live", playback: { publicId: "<script>" } }).publicId,
    undefined,
  );
  assert.throws(() => parseRounds({}));
  assert.equal(
    parseRounds({
      recentSettlements: [
        {
          previousSettledThroughRound: 0,
          settledThroughRound: 1,
          cumulativeWork: 7,
          workAdded: 7,
        },
      ],
    }).length,
    0,
  );
});
test("hour progress preserves BigInt precision and distinguishes missing/approximate baseline", () => {
  const start = 1791847800n + 600n * 60n;
  const status = parseStatus({
    measurement: { cumulativeWorkUnits: "9007199254740993123" },
  });
  const rows = [
    {
      previousSettledThroughRound: 59n,
      settledThroughRound: 60n,
      cumulativeWork: 9007199254740993000n,
      workAdded: 20n,
    },
  ];
  assert.equal(
    windowProgress(start, start + 3600n, start + 1n, 2100n, status, rows)
      ?.passes,
    123n,
  );
  assert.equal(
    windowProgress(start, start + 3600n, start + 1n, 2100n, status, rows)
      ?.approximate,
    false,
  );
  assert.equal(
    windowProgress(start, start + 3600n, start + 1n, 2100n, status, [])?.passes,
    undefined,
  );
  assert.equal(
    windowProgress(start, start + 3600n, start + 3600n, 2100n, status, rows),
    undefined,
  );
});
test("telemetry hours respect timezone offsets and preserve no-observation gaps", () => {
  const s = {
    activity: {
      typicalDay: [
        { startMinuteUtc: 0, meanWorkMilli: "12000", observedDayCount: 7 },
        { startMinuteUtc: 30, meanWorkMilli: "6000", observedDayCount: 7 },
      ],
    },
  } as any;
  assert.equal(hourly(s, 0)[0].value, 18);
  assert.equal(hourly(s, 120)[2].value, 18);
  assert.equal(hourly(s, 120)[0].observed, 0);
  assert.throws(() => parseStats({ status: "unavailable" }));
});
test("chat preserves signed text protocol, rejects links, and merges idempotently", () => {
  assert.equal(chatText(42, "Hi"), "Hamster Hour chat\n42\nHi");
  assert.equal(validateDraft("Hi"), "");
  assert.ok(validateDraft("https://bad.example"));
  assert.ok(validateDraft("a".repeat(201)));
  const m = {
    id: "a",
    address: "0x1111111111111111111111111111111111111111",
    message: "hi",
    ts: 42,
  };
  assert.equal(mergeMessages([m], [m]).length, 1);
});

test("quiet event refreshes use a block cursor and replay the reorg tail", async () => {
  const { loadEvents } = await import("../src/data");
  const calls: { fromBlock: bigint; toBlock: bigint }[] = [];
  let latest = 6000n;
  const r = {
    chain: { id: 1 },
    game: {
      address: "0x3333333333333333333333333333333333333333",
      deploymentBlock: "1000",
      abi: [],
    },
    client: {
      getBlockNumber: async () => latest,
      getLogs: async (a: any) => {
        calls.push(a);
        return [];
      },
    },
  } as any;
  const first = await loadEvents(r);
  assert.equal(calls[0].fromBlock, 1000n);
  assert.equal(calls[0].toBlock, 5999n);
  assert.equal(calls[1].toBlock, 6000n);
  calls.length = 0;
  latest = 6010n;
  await loadEvents(r, first);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fromBlock, 5988n);
  assert.equal(calls[0].toBlock, 6010n);
});
