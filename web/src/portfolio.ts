import { parseAbiItem, type Address, type Log } from "viem";
import type { Runtime } from "./config";
import handoff from "../deployment/handoff.json";
import type { GameWindow, Position } from "./model";
export const firstBlock = BigInt(
  Math.min(...handoff.contracts.map((c) => c.blockNumber)),
);
export async function scanLogs(
  r: Runtime,
  event: ReturnType<typeof parseAbiItem>,
  args: Record<string, unknown>,
  from: bigint,
  to: bigint,
  signal?: AbortSignal,
) {
  const logs: Log[] = [];
  for (let start = from; start <= to; start += 5000n) {
    signal?.throwIfAborted();
    logs.push(
      ...(await r.client.getLogs({
        address: r.game.address,
        event: event as any,
        args,
        fromBlock: start,
        toBlock: start + 4999n < to ? start + 4999n : to,
      })),
    );
  }
  return logs;
}
const scans = new Map<string, { through: bigint; ids: Set<string> }>();
export async function walletWindows(
  r: Runtime,
  account: Address,
  isTeam: boolean,
  signal?: AbortSignal,
) {
  const key = `${r.chain.id}:${r.game.address}:${account.toLowerCase()}:${isTeam}`;
  const cached = scans.get(key) ?? {
    through: firstBlock - 1n,
    ids: new Set<string>(),
  };
  const end = await r.client.getBlockNumber();
  const from =
    cached.through >= firstBlock + 12n ? cached.through - 12n : firstBlock;
  const events = await Promise.all([
    scanLogs(
      r,
      parseAbiItem(
        "event Bet(uint256 indexed windowId, address indexed bettor, uint8 indexed market, uint256 selection, uint256 amount)",
      ),
      { bettor: account },
      from,
      end,
      signal,
    ),
    scanLogs(
      r,
      parseAbiItem(
        "event Settled(uint256 indexed windowId, uint256 result, bytes32 indexed requestId, address indexed settler)",
      ),
      isTeam ? {} : { settler: account },
      from,
      end,
      signal,
    ),
  ]);
  const ids = new Set(cached.ids);
  for (const log of events.flat()) {
    const k = (log as any).args?.windowId;
    if (typeof k === "bigint") ids.add(String(k));
  }
  scans.set(key, { through: end, ids });
  return [...ids].map(BigInt).sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
}
export function positionTotal(p: Position) {
  return [...p.over, ...p.sleep, p.exactAmount].reduce((a, b) => a + b, 0n);
}
export function exactRank(w: GameWindow, p: Position) {
  if (!p.exactAmount) return -1;
  const distance = p.guess > w.result ? p.guess - w.result : w.result - p.guess;
  return w.distances.findIndex((d, i) => i < w.rankCount && d === distance);
}
/** Mirrors the deployed claim arithmetic, including the last claimant's rounding remainder. */
export function claimValue(
  w: GameWindow,
  p: Position,
  account: Address,
  team: Address,
  reserve: bigint,
  timedOut = false,
) {
  let imd = 0n,
    jackpot = 0n,
    jackpotEligible = false;
  if (!p.imdClaimed) {
    if (w.status === 3 || timedOut) imd = positionTotal(p);
    else if (w.status === 2) {
      for (const m of [0, 2] as const) {
        const pair = m === 0 ? p.over : p.sleep,
          pool = m === 0 ? w.over : w.sleep;
        if (w.marketVoided[m]) {
          imd += pair[0] + pair[1];
          continue;
        }
        const side = (m === 0 ? w.result > w.line : w.result === 0n) ? 1 : 0,
          weight = pair[side];
        if (weight && pool[side])
          imd +=
            w.claimedWeight[m] + weight === pool[side]
              ? w.rewards[m] - w.paid[m]
              : (w.rewards[m] * weight) / pool[side];
      }
      const rank = exactRank(w, p);
      if (rank >= 0 && w.ties[rank])
        imd +=
          w.rankClaimed[rank] + 1n === w.ties[rank]
            ? w.rankRewards[rank] - w.rankPaid[rank]
            : w.rankRewards[rank] / w.ties[rank];
    }
  }
  if (w.status === 2) {
    if (account.toLowerCase() === team.toLowerCase()) imd += w.teamCredit;
    if (account.toLowerCase() === w.settler.toLowerCase() && !w.reimbursed)
      imd +=
        w.reimbursement ||
        (reserve >= 500000000000000000n ? 500000000000000000n : 0n);
    jackpotEligible =
      !p.jackpotClaimed && w.jackpot > 0n && exactRank(w, p) === 0;
    if (jackpotEligible && w.ties[0])
      jackpot =
        w.jackpotClaimed + 1n === w.ties[0]
          ? w.jackpot - w.jackpotPaid
          : w.jackpot / w.ties[0];
  }
  return { imd, jackpot, jackpotEligible };
}
