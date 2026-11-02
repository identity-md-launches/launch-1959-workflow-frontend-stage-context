// Pure status rules for the My bets tab. Every rule mirrors HamsterHour v2
// (src/HamsterHour.sol at 49f53ca): claim(), claimable(), _entitlements(),
// _ouVoid(), _snVoid(), _timeout() and isWinningGuess().
import type { GameWindow, Position } from "./model";

export const STATUS = { None: 0, Open: 1, Settled: 2, TimedOut: 3 } as const;
export const SNOOZE_THRESHOLD = 100n;
export const TICKET_PRICE = 5n * 10n ** 18n;

export type BetState =
  | "pending"
  | "waiting-refund"
  | "refund-ready"
  | "refunded"
  | "won"
  | "claimed"
  | "lost"
  | "no-win";

export const STATE_LABEL: Record<BetState, string> = {
  pending: "Pending",
  "waiting-refund": "Waiting for refund",
  "refund-ready": "Refund ready",
  refunded: "Refunded",
  won: "Won",
  claimed: "Claimed",
  lost: "Lost",
  "no-win": "No win",
};

export const WAITING_TOOLTIP =
  "Nobody took the other side, so this market won't play. Your full stake is returned after 48h, no fees.";

/** One wallet event, already filtered to the connected address. */
export interface WalletBet {
  kind: "binary" | "ticket";
  k: bigint;
  /** 0 = OVER/UNDER, 1 = SNOOZE (BinaryBet market id). */
  market?: number;
  /** OVER for market 0, YES for market 1. */
  side?: boolean;
  amount: bigint;
  guess?: bigint;
  transactionHash: string;
  blockNumber: bigint;
  logIndex: number;
}

export interface WindowRead {
  k: bigint;
  window: GameWindow;
  position: Position;
  claimable: bigint;
  /** windowEnd(k) + TIMEOUT, both read from the contract. */
  unlockAt: bigint;
  loss: bigint;
  claimed: boolean;
}

export interface BetRow extends WalletBet {
  state: BetState;
  label: string;
  /** Amount shown with the status: refund, payout or jackpot share. */
  value?: bigint;
  /** Extra one-line explanation. */
  note?: string;
  /** Refund unlock time for "Waiting for refund". */
  unlockAt?: bigint;
}

export interface WindowRow extends WindowRead {
  bets: BetRow[];
  /** The window is past its 48h deadline but nobody has called timeout(k) yet. */
  needsTimeout: boolean;
  /** What a claim pays now (claimable, or the stake still owed once timed out). */
  due: bigint;
  staked: bigint;
}

export const marketName = (b: Pick<WalletBet, "kind" | "market" | "side">) =>
  b.kind === "ticket"
    ? "EXACT ticket"
    : b.market === 0
      ? b.side
        ? "OVER"
        : "UNDER"
      : b.side
        ? "SNOOZE yes"
        : "SNOOZE no";

export const isWinningGuess = (guess: bigint, result: bigint) =>
  (guess > result ? guess - result : result - guess) * 200n <= result;

/** _winnerPool: the two-sided pool less the 9% of binary fees. */
export function winnerPool(pool: bigint) {
  return (
    pool - (pool * 5n) / 100n - (pool * 2n) / 100n - pool / 100n - pool / 100n
  );
}

export function oneSided(w: GameWindow, market: number) {
  return market === 0
    ? w.over === 0n || w.under === 0n
    : w.yes === 0n || w.no === 0n;
}

/** Stake still owed if window k times out: every binary stake plus a ticket. */
export function timeoutRefund(p: Position) {
  return (
    p.over + p.under + p.yes + p.no + (p.hasTicket ? TICKET_PRICE : 0n) - p.paid
  );
}

function binaryRow(
  b: WalletBet,
  x: WindowRead,
  now: bigint,
  refundOnly: boolean,
): BetRow {
  const w = x.window,
    m = b.market ?? 0,
    paid = x.position.paid > 0n;
  const row = (state: BetState, extra: Partial<BetRow> = {}): BetRow => ({
    ...b,
    state,
    label: STATE_LABEL[state],
    ...extra,
  });
  if (refundOnly)
    return paid
      ? row("refunded", { value: b.amount, note: "Full stake returned." })
      : row("refund-ready", {
          value: b.amount,
          note:
            w.status === STATUS.TimedOut
              ? "The hour timed out, so every stake is returned."
              : "The 48h deadline passed. Claim times the hour out and returns your stake.",
        });
  if (w.status === STATUS.Settled) {
    const voided = m === 0 ? w.ouVoid : w.snVoid;
    if (voided)
      return paid
        ? row("refunded", { value: b.amount, note: "Full stake returned." })
        : row("refund-ready", {
            value: b.amount,
            note:
              m === 0 && w.result < SNOOZE_THRESHOLD && !oneSided(w, 0)
                ? "Under 100 passes, so OVER/UNDER was refunded."
                : "Nobody took the other side, so this market was refunded.",
          });
    const won =
      m === 0
        ? b.side === w.result > w.line
        : b.side === w.result < SNOOZE_THRESHOLD;
    if (!won) return row("lost");
    const own = m === 0 ? (b.side ? w.over : w.under) : b.side ? w.yes : w.no;
    const pool = m === 0 ? w.over + w.under : w.yes + w.no;
    const payout = own > 0n ? (b.amount * winnerPool(pool)) / own : 0n;
    return paid || (x.claimed && x.claimable === 0n)
      ? row("claimed", { value: payout })
      : row("won", { value: payout });
  }
  // Open: not settled and not timed out yet.
  const single = oneSided(w, m);
  if (single && now >= w.closesAt)
    return row("waiting-refund", { value: b.amount, unlockAt: x.unlockAt });
  if (single)
    return row("pending", {
      note: "Nobody is on the other side yet. Betting is still open.",
    });
  return row("pending", {
    note:
      now < w.endsAt
        ? "The hour has not ended yet."
        : "Waiting for the oracle result.",
  });
}

function ticketRow(b: WalletBet, x: WindowRead, refundOnly: boolean): BetRow {
  const w = x.window;
  const row = (state: BetState, extra: Partial<BetRow> = {}): BetRow => ({
    ...b,
    state,
    label: STATE_LABEL[state],
    ...extra,
  });
  if (refundOnly)
    return x.position.paid > 0n
      ? row("refunded", { value: TICKET_PRICE, note: "Ticket price returned." })
      : row("refund-ready", {
          value: TICKET_PRICE,
          note: "The hour timed out, so the ticket price is returned.",
        });
  if (w.status !== STATUS.Settled)
    return row("pending", {
      note: "Waiting for the result.",
    });
  const hit = b.guess !== undefined && isWinningGuess(b.guess, w.result);
  if (!hit)
    return row("no-win", { note: `Result ${w.result.toString()} passes.` });
  if (!w.jackpotFinalized)
    return row("pending", {
      note: "Your guess hit. The jackpot share is being finalized.",
    });
  if (w.jackpotShare === 0n)
    return row("no-win", { note: "No jackpot was paid for this hour." });
  return x.position.jackpotPaid
    ? row("claimed", { value: w.jackpotShare })
    : row("won", { value: w.jackpotShare });
}

/** Builds one row per window, newest first, each listing every bet event of the wallet. */
export function classify(
  bets: WalletBet[],
  reads: WindowRead[],
  now: bigint,
): WindowRow[] {
  const rows: WindowRow[] = [];
  for (const x of reads) {
    const own = bets
      .filter((b) => b.k === x.k)
      .sort((a, b) =>
        a.blockNumber === b.blockNumber
          ? a.logIndex - b.logIndex
          : a.blockNumber < b.blockNumber
            ? -1
            : 1,
      );
    if (!own.length) continue;
    const w = x.window;
    const needsTimeout = w.status === STATUS.Open && now >= w.timeoutAt;
    const refundOnly = w.status === STATUS.TimedOut || needsTimeout;
    const due = needsTimeout ? timeoutRefund(x.position) : x.claimable;
    rows.push({
      ...x,
      needsTimeout: needsTimeout && due > 0n,
      due,
      staked: own.reduce((n, b) => n + b.amount, 0n),
      bets: own.map((b) =>
        b.kind === "ticket"
          ? ticketRow(b, x, refundOnly)
          : binaryRow(b, x, now, refundOnly),
      ),
    });
  }
  return rows.sort((a, b) => (a.k > b.k ? -1 : 1));
}

/** Countdown text such as "5h 12m" or "48s". */
export function countdown(seconds: bigint) {
  const s = Number(seconds < 0n ? 0n : seconds);
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    r = s % 60;
  return h > 0
    ? `${h}h ${String(m).padStart(2, "0")}m`
    : m > 0
      ? `${m}m ${String(r).padStart(2, "0")}s`
      : `${r}s`;
}

const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
/** "16:20 UTC Nov 2". */
export function utcLabel(seconds: bigint) {
  const d = new Date(Number(seconds) * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC ${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
