import { useQuery } from "@tanstack/react-query";
import { formatUnits, parseAbi, type Address, type Hex } from "viem";
import type { Runtime } from "./config";
import { HAMSTER } from "./hamster";
import network from "../deployment/network.json";

const DAY = 86_400n;
export const RAY = 10n ** 27n;
export type RewardState = {
  weight: bigint;
  hookRate: bigint;
  gameRate: bigint;
  dripPrincipal: bigint;
  dripReleased: bigint;
  activationCursor: bigint;
};
const readAt =
  (r: Runtime, blockNumber: bigint) =>
  <T>(functionName: string, args: readonly unknown[] = []) =>
    r.client.readContract({
      address: HAMSTER.vault,
      abi: HAMSTER.vaultAbi,
      functionName,
      args,
      blockNumber,
    }) as Promise<T>;

// A current daily run rate, not a forecast of new deposits or stream expiries.
// Rates are IMD wei * RAY per active second; every source pauses at zero weight.
export function dailyRelease(s: RewardState) {
  if (s.weight === 0n) return 0n;
  return (
    (s.dripPrincipal - s.dripReleased) / 100n +
    ((s.hookRate + s.gameRate) * DAY) / RAY
  );
}
export async function loadRewards(r: Runtime) {
  const block = await r.client.getBlock();
  const read = readAt(r, block.number);
  const [drip, hook, game, paid, staked, grants] = await Promise.all(
    [
      "dripDeposited",
      "hookDeposited",
      "gameDeposited",
      "rewardsPaid",
      "totalStaked",
      "totalGrantBalance",
    ].map((fn) => read<bigint>(fn)),
  );
  // An overdue checkpoint must not hide the deposited pool or invent a run rate.
  let state: RewardState | undefined;
  try {
    state = await read<RewardState>("rewardState");
  } catch {
    /* The component offers a retry and leaves estimates unknown. */
  }
  return {
    blockNumber: block.number,
    waiting: drip + hook + game - paid,
    totalStaked: staked + grants,
    state,
    daily: state ? dailyRelease(state) : undefined,
  };
}
export type Rewards = Awaited<ReturnType<typeof loadRewards>>;
export const useRewards = (r: Runtime) =>
  useQuery({
    queryKey: ["hamster-rewards"],
    queryFn: () => loadRewards(r),
    refetchInterval: 20_000,
    retry: 1,
  });

export async function loadRewardWeight(
  r: Runtime,
  snapshot: Rewards,
  account: Address,
) {
  const read = readAt(r, snapshot.blockNumber);
  const [[weight, , , , cursor], [count]] = await Promise.all([
    read<readonly bigint[]>("accounts", [account]),
    read<readonly bigint[]>("positionCounts", [account]),
  ]);
  // Match the vault's bounded account preview. Never present a partial share.
  if (count - cursor > 128n) throw Error("Account checkpoint required");
  const lots = await Promise.all(
    Array.from({ length: Number(count - cursor) }, (_, i) =>
      read<readonly [bigint, bigint, boolean]>("lots", [
        account,
        cursor + BigInt(i),
      ]),
    ),
  );
  return lots.reduce(
    (n, [amount, activation]) =>
      activation < snapshot.state!.activationCursor ? n + amount : n,
    weight,
  );
}
export function stakeShare(weight: bigint, total: bigint) {
  return total > 0n ? Number((weight * 100_000_000n) / total) / 1_000_000 : 0;
}
export function personalDaily(daily: bigint, weight: bigint, total: bigint) {
  return total > 0n ? (daily * weight) / total : 0n;
}

// Read the actual hook pool ID, rather than selecting a similarly named token pair.
export const priceHookAbi = parseAbi([
  "function poolId() view returns (bytes32)",
]);
export const stateViewAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
]);
export function hamsterPriceInImd(sqrtPriceX96: bigint, imd: Address) {
  if (sqrtPriceX96 <= 0n) throw Error("Pool price unavailable");
  // Both tokens have 18 decimals. slot0 quotes currency1 per currency0.
  const ratio = (Number(sqrtPriceX96) / 2 ** 96) ** 2;
  const price =
    HAMSTER.token.toLowerCase() < imd.toLowerCase() ? ratio : 1 / ratio;
  if (!Number.isFinite(price) || price <= 0)
    throw Error("Pool price unavailable");
  return price;
}
export async function loadPoolPrice(r: Runtime) {
  const blockNumber = await r.client.getBlockNumber();
  const poolId = await r.client.readContract({
    address: HAMSTER.hook,
    abi: priceHookAbi,
    functionName: "poolId",
    blockNumber,
  });
  const [sqrtPriceX96] = await r.client.readContract({
    address: network.network.uniswapV4.stateView as Address,
    abi: stateViewAbi,
    functionName: "getSlot0",
    args: [poolId as Hex],
    blockNumber,
  });
  return hamsterPriceInImd(sqrtPriceX96, r.token.address);
}
export function selectImdUsd(data: unknown, imd: Address) {
  const pairs = (
    data as {
      pairs?: {
        chainId: string;
        baseToken: { address: string };
        priceUsd?: string;
        liquidity?: { usd?: number };
      }[];
    }
  )?.pairs;
  const pair = pairs
    ?.filter(
      (p) =>
        p.chainId === "ethereum" &&
        p.baseToken?.address?.toLowerCase() === imd.toLowerCase() &&
        Number.isFinite(Number(p.priceUsd)) &&
        Number(p.priceUsd) > 0 &&
        Number(p.liquidity?.usd) > 0,
    )
    .sort((a, b) => Number(b.liquidity?.usd) - Number(a.liquidity?.usd))[0];
  if (!pair) throw Error("IMD USD price unavailable");
  return Number(pair.priceUsd);
}
export async function loadImdUsd(imd: Address) {
  const response = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${imd}`,
    {
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw Error("IMD USD price unavailable");
  return selectImdUsd(await response.json(), imd);
}
export function estimatedApr(
  daily: bigint,
  total: bigint,
  hamsterImd: number,
  imdUsd: number,
) {
  const stakedUsd = Number(formatUnits(total, 18)) * hamsterImd * imdUsd;
  if (!(stakedUsd > 0)) return undefined;
  const apr =
    ((Number(formatUnits(daily, 18)) * imdUsd * 365) / stakedUsd) * 100;
  return Number.isFinite(apr) ? apr : undefined;
}
