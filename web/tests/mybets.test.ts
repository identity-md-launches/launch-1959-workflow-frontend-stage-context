import test from "node:test";
import assert from "node:assert/strict";
import {
  classify,
  countdown,
  utcLabel,
  type WalletBet,
  type WindowRead,
} from "../src/mybets";
import type { GameWindow, Position } from "../src/model";

// Snapshot of wallet 0x6a07…31f4 read from Ethereum block 26325577
// (2026-11-02 07:23:47 UTC): windows 437–450, all one-sided.
const W = 10n ** 18n,
  GENESIS = 1791847200n,
  NOW = 1793604227n,
  TIMEOUT = 172800n;
const end = (k: bigint) => GENESIS + k * 3600n + 3600n;
const win = (k: bigint, status: number, pools: Partial<GameWindow>) =>
  ({
    index: k,
    status,
    startsAt: end(k) - 3600n,
    closesAt: end(k) - 3600n,
    endsAt: end(k),
    timeoutAt: end(k) + TIMEOUT,
    line: 2100n,
    result: 0n,
    over: 0n,
    under: 0n,
    yes: 0n,
    no: 0n,
    tickets: 0n,
    ouVoid: false,
    snVoid: false,
    jackpotFinalized: false,
    jackpotShare: 0n,
    ...pools,
  }) as GameWindow;
const pos = (p: Partial<Position> = {}) =>
  ({
    over: 0n,
    under: 0n,
    yes: 0n,
    no: 0n,
    guess: 0n,
    hasTicket: false,
    jackpotPaid: false,
    paid: 0n,
    ...p,
  }) as Position;
const bet = (
  k: bigint,
  market: number,
  side: boolean,
  amount: bigint,
): WalletBet => ({
  kind: "binary",
  k,
  market,
  side,
  amount,
  transactionHash: "0x" + k.toString(16).padStart(64, "0"),
  blockNumber: 26300000n + k,
  logIndex: 0,
});
const read = (
  k: bigint,
  window: GameWindow,
  position: Position,
  claimable = 0n,
  claimed = false,
): WindowRead => ({
  k,
  window,
  position,
  claimable,
  unlockAt: end(k) + TIMEOUT,
  loss: 0n,
  claimed,
});
const half = W / 2n,
  p51 = (51n * W) / 100n,
  p168 = (168n * W) / 100n;
const bets = [
  bet(437n, 0, false, half),
  bet(438n, 1, true, p51),
  bet(439n, 1, true, half),
  bet(448n, 0, false, half),
  bet(449n, 1, true, p51),
  bet(450n, 1, true, p168),
];
const reads = [
  read(437n, win(437n, 3, { under: half }), pos({ under: half }), half),
  read(438n, win(438n, 3, { yes: p51 }), pos({ yes: p51 }), p51),
  read(439n, win(439n, 1, { yes: half }), pos({ yes: half })),
  read(448n, win(448n, 1, { under: half }), pos({ under: half })),
  read(449n, win(449n, 1, { yes: p51 }), pos({ yes: p51 })),
  read(450n, win(450n, 1, { yes: p168 }), pos({ yes: p168 })),
];

test("every bet of the example wallet appears with the expected status", () => {
  const rows = classify(bets, reads, NOW);
  assert.equal(rows.length, 6);
  assert.equal(
    rows.reduce((n, x) => n + x.staked, 0n),
    (42n * W) / 10n,
  );
  const by = Object.fromEntries(rows.map((x) => [String(x.k), x]));
  assert.equal(by["437"].bets[0].label, "Refund ready");
  assert.equal(by["437"].due, half);
  assert.equal(by["438"].bets[0].label, "Refund ready");
  assert.equal(by["438"].due, p51);
  // 439 passed its deadline at 07:20 UTC but timeout(439) has not been sent yet.
  assert.equal(by["439"].bets[0].label, "Refund ready");
  assert.equal(by["439"].needsTimeout, true);
  assert.equal(by["439"].due, half);
  for (const [k, at] of [
    ["448", "16:20 UTC Nov 2"],
    ["449", "17:20 UTC Nov 2"],
    ["450", "18:20 UTC Nov 2"],
  ]) {
    const b = by[k].bets[0];
    assert.equal(b.label, "Waiting for refund");
    assert.equal(utcLabel(b.unlockAt!), at);
    assert.equal(by[k].due, 0n);
  }
  assert.equal(countdown(by["448"].bets[0].unlockAt! - NOW), "8h 56m");
  assert.deepEqual(
    rows.map((x) => String(x.k)),
    ["450", "449", "448", "439", "438", "437"],
  );
});

test("claimed refunds, wins, losses and pending two-sided hours", () => {
  const k = 500n;
  const settled = win(k, 2, {
    over: 10n * W,
    under: 5n * W,
    yes: 2n * W,
    no: 0n,
    result: 2500n,
    snVoid: true,
  });
  const rows = classify(
    [bet(k, 0, true, 10n * W), bet(k, 1, true, 2n * W)],
    [
      read(
        k,
        settled,
        pos({ over: 10n * W, yes: 2n * W }),
        15650000000000000000n,
      ),
    ],
    NOW,
  );
  assert.deepEqual(
    rows[0].bets.map((b) => b.label),
    ["Won", "Refund ready"],
  );
  assert.equal(rows[0].bets[0].value, 13650000000000000000n);
  const paid = classify(
    [bet(k, 0, true, 10n * W), bet(k, 1, true, 2n * W)],
    [
      read(
        k,
        settled,
        pos({ over: 10n * W, yes: 2n * W, paid: 15650000000000000000n }),
        0n,
        true,
      ),
    ],
    NOW,
  );
  assert.deepEqual(
    paid[0].bets.map((b) => b.label),
    ["Claimed", "Refunded"],
  );
  const lost = classify(
    [bet(k, 0, false, 5n * W)],
    [read(k, settled, pos({ under: 5n * W }))],
    NOW,
  );
  assert.equal(lost[0].bets[0].label, "Lost");
  const future = win(9999n, 1, { over: W, under: W });
  const pending = classify(
    [bet(9999n, 0, true, W)],
    [read(9999n, future, pos({ over: W }))],
    NOW,
  );
  assert.equal(pending[0].bets[0].label, "Pending");
  // One-sided while betting is still open: the market can still be joined.
  const open = win(9999n, 1, { yes: W });
  const early = classify(
    [bet(9999n, 1, true, W)],
    [read(9999n, open, pos({ yes: W }))],
    NOW,
  );
  assert.equal(early[0].bets[0].label, "Pending");
});

test("EXACT tickets: pending, won, no win and timed-out refund", () => {
  const k = 600n;
  const t: WalletBet = {
    ...bet(k, 0, true, 5n * W),
    kind: "ticket",
    market: undefined,
    side: undefined,
    guess: 2000n,
  };
  const p = pos({ hasTicket: true, guess: 2000n });
  const open = classify(
    [t],
    [read(k, win(k, 1, { tickets: 1n }), p)],
    end(k) + 60n,
  );
  assert.equal(open[0].bets[0].label, "Pending");
  const hit = win(k, 2, {
    result: 2005n,
    jackpotFinalized: true,
    jackpotShare: 40n * W,
  });
  assert.equal(
    classify([t], [read(k, hit, p, 40n * W)], NOW)[0].bets[0].label,
    "Won",
  );
  assert.equal(
    classify(
      [t],
      [read(k, hit, pos({ hasTicket: true, jackpotPaid: true }), 0n, true)],
      NOW,
    )[0].bets[0].label,
    "Claimed",
  );
  const miss = win(k, 2, {
    result: 2100n,
    jackpotFinalized: true,
    jackpotShare: 40n * W,
  });
  assert.equal(
    classify([t], [read(k, miss, p)], NOW)[0].bets[0].label,
    "No win",
  );
  const timed = classify(
    [t],
    [read(k, win(k, 3, { tickets: 1n }), p, 5n * W)],
    NOW,
  );
  assert.equal(timed[0].bets[0].label, "Refund ready");
  assert.equal(timed[0].due, 5n * W);
});
