import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { completedWindows, observedPasses, winningSides } from "../src/history";
import {
  isLiveStream,
  parseLive,
  parseRounds,
  SQUEEKCHAIN_GENESIS,
} from "../src/live";
import { wakeEstimate, type Stats } from "../src/telemetry";
import { number, imd, type GameWindow } from "../src/model";

const start = BigInt(Date.parse("2026-10-19T22:00:00Z") / 1000);
const window = (at = start) =>
  ({
    startsAt: at,
    endsAt: at + 3600n,
    over: 0n,
    under: 0n,
    yes: 0n,
    no: 0n,
    tickets: 0n,
    status: 0,
    line: 2100n,
    result: 0n,
  }) as GameWindow;
test("history excludes ongoing/future/older windows and sorts finished hours newest first", () => {
  const rows = [
    window(start - 7200n),
    window(),
    window(start - 3600n),
    window(start + 3600n),
    window(start - 86400n),
  ];
  assert.deepEqual(
    completedWindows(rows, start + 3600n).map((w) => w.startsAt),
    [start, start - 3600n, start - 7200n],
  );
});
test("observed history includes no-bet hours, zero passes, and rejects partial/missing buckets", () => {
  const stats = {
    activity: {
      days: [
        {
          date: "2026-10-19",
          buckets: [
            { startMinuteUtc: 1320, coverage: "complete", workUnits: "1394" },
            { startMinuteUtc: 1350, coverage: "complete", workUnits: "1388" },
          ],
        },
      ],
    },
  } as Stats;
  assert.equal(observedPasses(window(), stats), 2782n);
  stats.activity.days[0].buckets[1].workUnits = "0";
  assert.equal(observedPasses(window(), stats), 1394n);
  stats.activity.days[0].buckets[0].workUnits = "0";
  assert.equal(observedPasses(window(), stats), 0n);
  stats.activity.days[0].buckets[1].coverage = "partial";
  assert.equal(observedPasses(window(), stats), undefined);
  assert.equal(observedPasses(window(start + 86400n), stats), undefined);
});
test("round boundary counters and quiet mining checkpoints produce actual hourly deltas", () => {
  const first = (start - SQUEEKCHAIN_GENESIS) / 600n;
  const rows = parseRounds({
    recentSettlements: [],
    mining: {
      recentCheckpoints: [
        {
          afterRound: String(first - 1n),
          throughRound: String(first),
          cumulativeWork: "9007199254740993000",
        },
        {
          afterRound: String(first),
          throughRound: String(first + 6n),
          cumulativeWork: "9007199254740993123",
        },
        {
          afterRound: String(first + 6n),
          throughRound: String(first + 12n),
          cumulativeWork: "9007199254740993123",
        },
      ],
    },
  });
  assert.equal(observedPasses(window(), undefined, rows), 123n);
  assert.equal(observedPasses(window(start + 3600n), undefined, rows), 0n);
  assert.equal(
    observedPasses(window(start + 7200n), undefined, rows),
    undefined,
  );
});
test(":20 game boundaries accept complete zero buckets but never prorate active half-hours", () => {
  const s = {
    activity: {
      days: [
        {
          date: "2026-10-19",
          buckets: [
            { startMinuteUtc: 1320, coverage: "complete", workUnits: "0" },
            { startMinuteUtc: 1350, coverage: "complete", workUnits: "100" },
            { startMinuteUtc: 1380, coverage: "complete", workUnits: "0" },
          ],
        },
      ],
    },
  } as Stats;
  assert.equal(observedPasses(window(start + 1200n), s), 100n);
  s.activity.days[0].buckets[0].workUnits = "1";
  assert.equal(observedPasses(window(start + 1200n), s), undefined);
});
test("history keeps telemetry separate from each market's settled winner and refunds", () => {
  assert.equal(winningSides(window()), "No bets");
  assert.equal(
    winningSides({
      ...window(),
      status: 2,
      result: 2100n,
      over: 1n,
      under: 1n,
      yes: 1n,
      no: 1n,
    }),
    "Under · Snooze no",
  );
  assert.equal(
    winningSides({
      ...window(),
      status: 2,
      result: 0n,
      over: 1n,
      under: 1n,
      yes: 1n,
      no: 1n,
    }),
    "Over/under refunded · Snooze yes",
  );
  assert.equal(
    winningSides({ ...window(), status: 1, over: 1n }),
    "Awaiting oracle",
  );
  assert.equal(winningSides({ ...window(), status: 3, over: 1n }), "Refund");
});
test("only a fresh, explicitly live, supported camera with an unexpired lease may embed", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  const live = parseLive({
    state: "live",
    playback: { kind: "youtube", publicId: "BWkC7PAYORA" },
    observedAt: new Date(now - 1000).toISOString(),
    validUntil: new Date(now + 120000).toISOString(),
  });
  assert.ok(isLiveStream(live, now));
  assert.equal(isLiveStream(live, now + 120000), false);
  for (const patch of [
    { state: "offline" },
    { state: "unknown" },
    { kind: "archive" },
    { observedAt: undefined },
    { validUntil: undefined },
    { observedAt: new Date(now - 181000).toISOString() },
    { publicId: undefined },
  ])
    assert.equal(isLiveStream({ ...live, ...patch }, now), false);
});
test("wake estimate uses first future hour at least 100 passes, not a fraction of the peak", () => {
  const now = new Date("2026-10-20T09:00:00Z");
  const local = now.getHours(),
    offset = -now.getTimezoneOffset();
  const minute = (hours: number) =>
    ((local + hours) * 60 - offset + 1440) % 1440;
  const stats = {
    generatedAt: now.toISOString(),
    activity: {
      typicalDay: [
        {
          startMinuteUtc: minute(1),
          meanWorkMilli: "99000",
          observedDayCount: 7,
        },
        {
          startMinuteUtc: minute(12),
          meanWorkMilli: "100000",
          observedDayCount: 7,
        },
        {
          startMinuteUtc: minute(13),
          meanWorkMilli: "10000000",
          observedDayCount: 7,
        },
      ],
    },
  } as Stats;
  assert.equal(wakeEstimate(stats, now), 12);
  assert.equal(
    wakeEstimate({ ...stats, generatedAt: "2026-10-17T00:00:00Z" }, now),
    undefined,
  );
});
test("saved real telemetry yields an hourly sum rather than a typical-day average", async () => {
  const s = JSON.parse(
    await readFile(
      new URL("../public/telemetry/stats7.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    observedPasses(
      window(BigInt(Date.parse("2026-10-13T22:00:00Z") / 1000)),
      s,
    ),
    2782n,
  );
  assert.equal(
    observedPasses(
      window(BigInt(Date.parse("2026-10-13T12:00:00Z") / 1000)),
      s,
    ),
    0n,
  );
});
test("numeric display uses commas and preserves bigint precision", () => {
  assert.equal(number(2100n), "2,100");
  assert.equal(number(9007199254740993123n), "9,007,199,254,740,993,123");
  assert.equal(imd(2100000000000000000000n), "2,100");
});
