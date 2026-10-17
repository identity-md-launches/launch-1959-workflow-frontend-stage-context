import {
  formatUnits,
  parseUnits,
  maxUint256,
  type Address,
  type Hex,
} from "viem";
export type Triple = readonly [bigint, bigint, bigint];
export type Pair = readonly [bigint, bigint];
export const counted = (
  n: number | bigint,
  singular: string,
  plural = `${singular}s`,
) => `${n} ${n === 1 || n === 1n ? singular : plural}`;
export interface GameWindow {
  status: number;
  startsAt: bigint;
  endsAt: bigint;
  line: bigint;
  source: string;
  result: bigint;
  pools: Triple;
  over: Pair;
  sleep: Pair;
  rewards: Triple;
  marketVoided: readonly boolean[];
  paid: Triple;
  claimedWeight: Triple;
  distances: Triple;
  ties: Triple;
  rankRewards: Triple;
  rankClaimed: Triple;
  rankPaid: Triple;
  rankCount: number;
  settler: Address;
  teamCredit: bigint;
  reimbursement: bigint;
  reimbursed: boolean;
  jackpotAsset: Address;
  jackpot: bigint;
  jackpotPaid: bigint;
  jackpotClaimed: bigint;
  requestId: Hex;
}
export interface Position {
  over: Pair;
  sleep: Pair;
  exactAmount: bigint;
  guess: bigint;
  imdClaimed: boolean;
  jackpotClaimed: boolean;
}
export const uint = (text: string, bits = 256): bigint => {
  if (!/^\d+$/.test(text.trim()))
    throw Error("Enter a whole number, zero or greater.");
  const value = BigInt(text.trim());
  if (value >= 2n ** BigInt(bits))
    throw Error(`This number exceeds uint${bits}.`);
  return value;
};
export function amount(text: string, decimals: number): bigint {
  if (!/^\d+(?:\.\d+)?$/.test(text.trim()))
    throw Error("Enter a positive token amount.");
  if ((text.split(".")[1]?.length ?? 0) > decimals)
    throw Error(`Use at most ${decimals} decimal places.`);
  const n = parseUnits(text.trim(), decimals);
  if (n <= 0n || n > maxUint256)
    throw Error("Enter an amount above zero within the token limit.");
  return n;
}
export function units(
  value: bigint | undefined,
  decimals = 18,
  digits = 4,
): string {
  if (value === undefined) return "Unavailable";
  const [whole, fraction = ""] = formatUnits(value, decimals).split(".");
  const tail = fraction.slice(0, digits).replace(/0+$/, "");
  const tiny = value > 0n && whole === "0" && !tail;
  return tiny
    ? `<0.${"0".repeat(Math.max(0, digits - 1))}1`
    : whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (tail ? "." + tail : "");
}
export const winnersPool = (pool: bigint) =>
  pool - (pool * 5n) / 100n - (pool * 3n) / 100n - pool / 100n;
export function payoutMultiple(
  pool: bigint,
  side: bigint,
  other: bigint,
): string {
  if (side === 0n || other === 0n) return "Refund if one-sided";
  return formatUnits((winnersPool(pool) * 100n) / side, 2) + "×";
}
export function availableJackpot(
  balance: bigint,
  liability: bigint,
  imdLiability: bigint,
  staked: bigint,
  isIMD: boolean,
  isStake: boolean,
) {
  const reserved =
    liability + (isIMD ? imdLiability : 0n) + (isStake ? staked : 0n);
  return balance > reserved ? balance - reserved : 0n;
}
export function defaultWindow(
  current: bigint,
  started: boolean,
  floor: bigint,
) {
  const next = started ? current + 1n : 0n;
  return next > floor ? next : floor;
}
export const shortAddress = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
export const dateTime = (s: bigint | undefined) =>
  s === undefined
    ? "Unavailable"
    : s > 8640000000000n
      ? `${s} Unix seconds`
      : new Date(Number(s) * 1000).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        });
export function countdown(end: bigint | undefined, now: number) {
  if (end === undefined) return "--:--:--";
  const seconds = Math.max(0, Number(end) - Math.floor(now / 1000));
  if (seconds > 86400)
    return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
  return [
    Math.floor(seconds / 3600),
    Math.floor((seconds % 3600) / 60),
    seconds % 60,
  ]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}
export function uuidFromBytes32(hex: string): string {
  if (!/^0x[0-9a-fA-F]{32}0{32}$/.test(hex))
    throw Error("The oracle request ID is not a UUID.");
  const s = hex.slice(2, 34);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
export function bytes32FromId(value: unknown): Hex {
  if (typeof value !== "string") throw Error("Missing oracle identifier.");
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) return value as Hex;
  if (/^[\da-fA-F]{8}(-[\da-fA-F]{4}){3}-[\da-fA-F]{12}$/.test(value))
    return `0x${value.replaceAll("-", "")}${"0".repeat(32)}`;
  throw Error("Oracle identifiers must be UUIDs or bytes32 hex.");
}
export function parseAttestation(text: string, chainId: number, game: Address) {
  const document = JSON.parse(text);
  const m = document.message ?? document.attestation;
  if (!m || typeof m !== "object")
    throw Error("Paste an oracle response with message and signature.");
  if (
    document.domain &&
    (Number(document.domain.chainId) !== chainId ||
      document.domain.verifyingContract?.toLowerCase() !== game.toLowerCase() ||
      document.domain.name !== "IdentityMD Oracle" ||
      document.domain.version !== "2")
  )
    throw Error(
      "This attestation is for a different consumer, chain or protocol.",
    );
  const a: Record<string, unknown> = {};
  for (const f of ["requestId", "questionHash", "blockHash", "panelJobId"])
    a[f] = bytes32FromId(m[f]);
  for (const f of [
    "chainId",
    "figure",
    "fromBlock",
    "toBlock",
    "issuedAt",
    "expiresAt",
  ]) {
    if (typeof m[f] === "number" && !Number.isSafeInteger(m[f]))
      throw Error(
        `Use a decimal string for ${f}; the JSON number loses precision.`,
      );
    a[f] = uint(String(m[f]), ["chainId", "figure"].includes(f) ? 256 : 64);
  }
  for (const f of ["panelSize", "quorum", "agreed"])
    a[f] = Number(uint(String(m[f]), 16));
  a.answerType =
    m.answerType === "uint256" ? 3 : Number(uint(String(m.answerType), 8));
  if (a.answerType !== 3 || a.chainId !== BigInt(chainId))
    throw Error("The result must be uint256 on this chain.");
  if (typeof m.answer !== "string" || !/^0x[\da-fA-F]{64}$/.test(m.answer))
    throw Error("The signed answer must be 32-byte hex.");
  a.answer = m.answer;
  if (
    typeof document.signature !== "string" ||
    !/^0x[\da-fA-F]{130}$/.test(document.signature)
  )
    throw Error("A 65-byte attester signature is required.");
  return {
    attestation: a,
    signature: document.signature as Hex,
    result: BigInt(m.answer),
  };
}
const messages: Record<string, string> = {
  BettingClosed:
    "Betting has closed for this window. Choose the next open window.",
  BelowMinimum: "The minimum bet is 0.5 IMD.",
  DuplicateExactBet: "You already have an EXACT ticket in this window.",
  ExactFull: "This window has reached its 256 EXACT tickets.",
  PoolLimit: "This market has reached its pool limit.",
  NothingToClaim: "No payout is available for this account and window.",
  NotFinal: "This window is still awaiting settlement or its refund deadline.",
  NotTimedOut: "The 48-hour refund deadline has not arrived.",
  NotSettleable:
    "The window is not in its settlement period or has already been finalized.",
  TokenNotConfigured: "This token has not been configured yet.",
  NotTeam: "Only TEAM can change this setting.",
  AlreadyConfigured:
    "This token setting has already been used and cannot change.",
  TimelockNotReady:
    "Wait until the 48-hour timelock ends and use the exact scheduled value.",
  WrongQuestion:
    "The attestation does not answer this window’s frozen question.",
  BadSignature: "The signature is not valid for this game and oracle signer.",
  AlreadyConsumed: "This oracle attestation has already been used.",
  InvalidValidityWindow:
    "The attestation is expired or its validity window is invalid.",
  AttestationPredatesEnd:
    "The attestation was issued before the six rounds ended.",
  UnsupportedToken:
    "The token does not support the contract’s exact-transfer requirements.",
  InvalidAmount: "Enter a positive amount within your available balance.",
  InvalidAddress: "Use a nonzero token address other than the game contract.",
  InvalidWindow:
    "This window does not exist or is outside the supported range.",
};
export function errorText(error: unknown): string {
  let e: any = error;
  for (let i = 0; e && i < 12; i++, e = e.cause) {
    if (e.code === 4001 || e.name === "UserRejectedRequestError")
      return "Request declined in your wallet. You can try again.";
    if (e.data?.errorName)
      return (
        messages[e.data.errorName] ??
        `Contract rejected this action (${e.data.errorName}). Refresh state before retrying.`
      );
    if (e.name === "InsufficientFundsError")
      return "Your wallet needs enough ETH to cover network fees.";
  }
  if (
    error instanceof Error &&
    error.message.length < 240 &&
    !/https?:\/\/|0x[\da-f]{8}/i.test(error.message)
  )
    return error.message;
  return "The request could not complete. Check your wallet and connection, refresh state, and try again.";
}
