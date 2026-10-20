import { formatUnits, parseUnits } from "viem";
export type Side = "over" | "under" | "snooze";
export interface GameWindow {
  index: bigint;
  status: number;
  startsAt: bigint;
  endsAt: bigint;
  closesAt: bigint;
  timeoutAt: bigint;
  line: bigint;
  result: bigint;
  over: bigint;
  under: bigint;
  yes: bigint;
  no: bigint;
  tickets: bigint;
  ouVoid: boolean;
  snVoid: boolean;
  feesAllocated: boolean;
  jackpotFinalized: boolean;
  jackpotPot: bigint;
  jackpotWinners: bigint;
  jackpotShare: bigint;
  pendingJackpotDeposits: bigint;
  oracleRequested: boolean;
  oracleRequestPending: boolean;
  publicSettleHeld: boolean;
  intakeRequestId: string;
  requestId: string;
}
export interface Position {
  over: bigint;
  under: bigint;
  yes: bigint;
  no: bigint;
  guess: bigint;
  hasTicket: boolean;
  jackpotPaid: boolean;
  paid: bigint;
}
export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const counted = (n: number | bigint, word: string) =>
  `${n.toLocaleString()} ${word}${n === 1 || n === 1n ? "" : "s"}`;
export const imd = (n: bigint | undefined, digits = 2) =>
  n === undefined
    ? "—"
    : Number(formatUnits(n, 18)).toLocaleString(undefined, {
        maximumFractionDigits: digits,
      });
export const time = (seconds: bigint | number) =>
  new Date(Number(seconds) * 1000).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
export const span = (w: GameWindow) => `${time(w.startsAt)}–${time(w.endsAt)}`;
export const dateLabel = (seconds: bigint | number) =>
  new Date(Number(seconds) * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export function amountValue(text: string, min = 1n): bigint {
  if (!/^(?:\d+)(?:\.\d{0,18})?$/.test(text))
    throw Error("Enter an amount with up to 18 decimals.");
  const v = parseUnits(text, 18);
  if (v < min)
    throw Error(
      min === 500000000000000000n
        ? "The minimum bet is 0.5 IMD."
        : "Enter an amount greater than zero.",
    );
  if (v >= 1n << 128n) throw Error("This amount exceeds the pool limit.");
  return v;
}
export function payout(
  w: GameWindow,
  side: Side,
  stake: bigint,
  snoozeYes = true,
) {
  const own =
    side === "over"
      ? w.over
      : side === "under"
        ? w.under
        : snoozeYes
          ? w.yes
          : w.no;
  const other =
    side === "over"
      ? w.under
      : side === "under"
        ? w.over
        : snoozeYes
          ? w.no
          : w.yes;
  if (other === 0n) return { amount: stake, multiple: 1, refund: true };
  const total = own + other + stake;
  const winners =
    total -
    (total * 5n) / 100n -
    (total * 2n) / 100n -
    total / 100n -
    total / 100n;
  const amount = (stake * winners) / (own + stake);
  return {
    amount,
    multiple: Number((amount * 100n) / stake) / 100,
    refund: false,
  };
}
export function errorText(error: unknown): string {
  let e: any = error;
  for (let i = 0; e && i < 12; i++, e = e.cause) {
    if (e.code === 4001 || e.name === "UserRejectedRequestError")
      return "Request declined in your wallet. You can try again.";
    if (e.data?.errorName)
      return `Contract rejected the action (${e.data.errorName}). Refresh and check your bet.`;
    if (e.name === "InsufficientFundsError")
      return "Your wallet needs ETH for network fees.";
  }
  return error instanceof Error &&
    error.message.length < 200 &&
    !/https?:\/\//.test(error.message)
    ? error.message
    : "The request could not complete. Refresh state and try again.";
}
