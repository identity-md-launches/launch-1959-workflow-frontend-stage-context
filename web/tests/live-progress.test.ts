import test from "node:test";
import assert from "node:assert/strict";
import {
  parseRounds,
  parseStatus,
  windowProgress,
  SQUEEKCHAIN_GENESIS as genesis,
} from "../src/live";
import { counted } from "../src/model";

const start = genesis + 6000n;
const end = start + 3600n;
const settlement = (round: string, cumulative = "9007199254740993000") => ({
  previousSettledThroughRound: (BigInt(round) - 1n).toString(),
  settledThroughRound: round,
  cumulativeWork: cumulative,
  workAdded: "100",
});
const status = (n: string | number) =>
  parseStatus({ measurement: { cumulativeWorkUnits: n, speedMmPerSecond: 0 } });

test("progress uses Squeekchain's one-based rounds and the exact preceding settlement", () => {
  const rounds = parseRounds({
    recentSettlements: [settlement("12"), settlement("10"), settlement("9")],
  });
  const p = windowProgress(
    start,
    end,
    start + 600n,
    1000n,
    status("9007199254740993250"),
    rounds,
  )!;
  assert.equal(p.firstRound, 11n);
  assert.equal(p.lastRound, 16n);
  assert.equal(p.round, 2);
  assert.equal(p.passes, 250n);
  assert.equal(p.percent, 25);
  assert.equal(p.approximate, false);
  // Moving the GAME start by a round changes the mapping; its genesis is never an input.
  const shifted = windowProgress(
    start + 600n,
    end + 600n,
    start + 600n,
    1000n,
    status("9007199254740993250"),
    rounds,
  )!;
  assert.equal(shifted.firstRound, 12n);
  assert.equal(shifted.round, 1);
  assert.equal(shifted.approximate, true);
});

test("running interval is start-inclusive, end-exclusive; displayed round is clamped to six", () => {
  for (const [offset, round] of [
    [0n, 1],
    [599n, 1],
    [600n, 2],
    [2999n, 5],
    [3000n, 6],
    [3599n, 6],
  ] as const) {
    assert.equal(
      windowProgress(start, end, start + offset, 1n, undefined, [])?.round,
      round,
    );
  }
  assert.equal(
    windowProgress(start, end, start - 1n, 1n, undefined, []),
    undefined,
  );
  assert.equal(windowProgress(start, end, end, 1n, undefined, []), undefined);
  assert.equal(
    windowProgress(start, end + 600n, end, 1n, undefined, [])?.round,
    6,
  );
  assert.equal(
    windowProgress(genesis - 1n, genesis + 3600n, genesis, 1n, undefined, [])
      ?.firstRound,
    0n,
  );
});

test("fallback selects the latest earlier settlement; future and spanning rows are not exact baselines", () => {
  const rows = parseRounds({
    recentSettlements: [
      settlement("8", "80"),
      settlement("13", "130"),
      settlement("9", "90"),
    ],
  });
  const p = windowProgress(start, end, start, 100n, status("120"), rows)!;
  assert.equal(p.passes, 30n);
  assert.equal(p.approximate, true);
  const missing = windowProgress(
    start,
    end,
    start,
    100n,
    status("120"),
    rows.filter((s) => s.settledThroughRound > 10n),
  )!;
  assert.equal(missing.passes, undefined);
  assert.equal(missing.percent, undefined);
});

test("sleeping and counter regressions stay at zero; huge counters preserve BigInt precision and cap 100%", () => {
  const rounds = parseRounds({ recentSettlements: [settlement("10")] });
  for (const n of ["9007199254740993000", "9007199254740992999"]) {
    const p = windowProgress(start, end, start, 1000n, status(n), rounds)!;
    assert.equal(p.passes, 0n);
    assert.equal(p.percent, 0);
  }
  const p = windowProgress(
    start,
    end,
    start,
    1000n,
    status("9007199254741993000"),
    rounds,
  )!;
  assert.equal(p.passes, 1000000n);
  assert.equal(p.percent, 100);
  assert.equal(
    windowProgress(start, end, start, 0n, status("9007199254740993000"), rounds)
      ?.percent,
    0,
  );
});

test("feed parsing rejects unsafe counters and malformed settlements rather than inventing live passes", () => {
  assert.throws(() => parseRounds({}), /unavailable/);
  const rows = parseRounds({
    recentSettlements: [
      settlement("10"),
      { ...settlement("9"), cumulativeWork: 9007199254740993 },
      { ...settlement("8"), workAdded: "-1" },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(typeof rows[0].workAdded, "bigint");
  assert.equal(
    parseRounds({
      recentSettlements: Array.from({ length: 12 }, () => settlement("10")),
    }).length,
    10,
  );
  for (const n of [9007199254740992, "invalid"]) {
    assert.equal(
      windowProgress(start, end, start, 1000n, status(n), rows)?.passes,
      undefined,
    );
  }
  assert.equal(
    windowProgress(start, end, start, 1000n, undefined, rows)?.passes,
    undefined,
  );
});

test("all dynamic counters use singular only for exactly one", () => {
  for (const [n, word] of [
    [0, "messages"],
    [1, "message"],
    [2, "messages"],
    [1n, "message"],
  ] as const) {
    assert.equal(counted(n, "message"), `${n} ${word}`);
  }
  assert.equal(counted(1n, "pass", "passes"), "1 pass");
  assert.equal(counted(0n, "pass", "passes"), "0 passes");
  assert.equal(counted(1, "time"), "1 time");
  assert.equal(counted(2, "time"), "2 times");
});
