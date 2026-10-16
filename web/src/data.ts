import { useQuery } from "@tanstack/react-query";
import { erc20Abi, zeroAddress, type Address } from "viem";
import type { Runtime } from "./config";
import {
  availableJackpot,
  defaultWindow,
  type GameWindow,
  type Position,
} from "./model";
export const same = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();
export function reader(runtime: Runtime) {
  return <T = unknown>(
    functionName: string,
    args: readonly unknown[] = [],
    blockNumber?: bigint,
  ): Promise<T> =>
    runtime.client.readContract({
      address: runtime.game.address,
      abi: runtime.game.abi,
      functionName,
      args,
      blockNumber,
    }) as Promise<T>;
}
export async function verifyDeployment(r: Runtime) {
  if ((await r.client.getChainId()) !== r.deployment.chainId)
    throw Error(
      "The RPC returned a different chain. Transactions are disabled.",
    );
  const codes = await Promise.all(
    r.deployment.contracts.map((c) => r.client.getCode({ address: c.address })),
  );
  if (codes.some((c) => !c || c === "0x"))
    throw Error(
      "A deployed contract has no code on this network. Transactions are disabled.",
    );
  const verifier = await reader(r)<Address>("oracleVerifier");
  if (!same(verifier, r.verifier.address))
    throw Error(
      "The game’s oracle verifier differs from the deployment handoff.",
    );
  return true;
}
export function useVerification(r: Runtime) {
  return useQuery({
    queryKey: ["verification"],
    queryFn: () => verifyDeployment(r),
    staleTime: 60000,
    refetchInterval: 60000,
    retry: 1,
  });
}
export async function loadGlobal(r: Runtime) {
  const read = reader(r);
  const block = await r.client.getBlock();
  const calls = [
    "currentRound",
    "currentWindow",
    "hasStarted",
    "closedWindowFloor",
    "currentLine",
    "settledWindows",
    "stakingToken",
    "jackpotToken",
    "IMD",
    "TEAM",
    "sourceUrl",
    "genesisTimestamp",
    "totalStaked",
    "preStakingReserve",
    "oracleReserve",
    "imdLiability",
    "jackpotLiability",
    "releaseWindows",
    "reserveReleased",
    "releaseTotal",
    "stakingUndistributed",
    "MIN_BET",
    "TIMEOUT",
    "CONFIG_DELAY",
    "MAX_EXACT_ENTRIES",
    "MAX_POOL",
  ] as const;
  const result = await Promise.all(
    calls.map((fn) => read(fn, [], block.number)),
  );
  const v = Object.fromEntries(calls.map((k, i) => [k, result[i]])) as {
    currentRound: bigint;
    currentWindow: bigint;
    hasStarted: boolean;
    closedWindowFloor: bigint;
    currentLine: bigint;
    settledWindows: bigint;
    stakingToken: Address;
    jackpotToken: Address;
    IMD: Address;
    TEAM: Address;
    sourceUrl: string;
    genesisTimestamp: bigint;
    totalStaked: bigint;
    preStakingReserve: bigint;
    oracleReserve: bigint;
    imdLiability: bigint;
    jackpotLiability: bigint;
    releaseWindows: bigint;
    reserveReleased: bigint;
    releaseTotal: bigint;
    stakingUndistributed: bigint;
    MIN_BET: bigint;
    TIMEOUT: bigint;
    CONFIG_DELAY: bigint;
    MAX_EXACT_ENTRIES: bigint;
    MAX_POOL: bigint;
  };
  return {
    ...v,
    blockNumber: block.number,
    timestamp: block.timestamp,
    candidate: defaultWindow(
      v.currentWindow,
      v.hasStarted,
      v.closedWindowFloor,
    ),
  };
}
export type GlobalState = Awaited<ReturnType<typeof loadGlobal>>;
export function useGlobal(r: Runtime) {
  return useQuery({
    queryKey: ["global"],
    queryFn: () => loadGlobal(r),
    refetchInterval: 12000,
    retry: 1,
  });
}
export async function loadWindow(r: Runtime, k: bigint, account?: Address) {
  const read = reader(r);
  const block = await r.client.getBlock();
  const [window, times, open, entries, position] = await Promise.all([
    read<GameWindow>("window", [k], block.number),
    read<readonly [bigint, bigint]>("windowTimes", [k], block.number),
    read<boolean>("isBettingOpen", [k], block.number),
    read<bigint>("exactEntries", [k], block.number),
    account
      ? read<Position>("position", [k, account], block.number)
      : undefined,
  ]);
  return {
    window,
    times,
    open,
    entries,
    position,
    blockNumber: block.number,
    timestamp: block.timestamp,
  };
}
export function useWindow(
  r: Runtime,
  k: bigint | undefined,
  account?: Address,
) {
  return useQuery({
    queryKey: ["window", k?.toString(), account],
    queryFn: () => loadWindow(r, k!, account),
    enabled: k !== undefined,
    refetchInterval: 12000,
    retry: 1,
  });
}
export async function tokenState(
  r: Runtime,
  address: Address,
  account?: Address,
) {
  const block = await r.client.getBlock();
  const read = <T>(functionName: string, args: readonly unknown[] = []) =>
    r.client.readContract({
      address,
      abi: erc20Abi,
      functionName,
      args,
      blockNumber: block.number,
    } as any) as Promise<T>;
  const [symbol, decimals, balance, allowance] = await Promise.all([
    read<string>("symbol").catch(() => "Token"),
    read<number>("decimals"),
    account ? read<bigint>("balanceOf", [account]) : undefined,
    account ? read<bigint>("allowance", [account, r.game.address]) : undefined,
  ]);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255)
    throw Error("The token returned unsupported decimals.");
  return { address, symbol, decimals, balance, allowance };
}
export function useToken(
  r: Runtime,
  address: Address | undefined,
  account?: Address,
) {
  return useQuery({
    queryKey: ["token", address, account],
    queryFn: () => tokenState(r, address!, account),
    enabled: !!address && address !== zeroAddress,
    refetchInterval: 12000,
    retry: 1,
  });
}
export type TokenState = Awaited<ReturnType<typeof tokenState>>;
export function useJackpot(r: Runtime, g: GlobalState | undefined) {
  return useQuery({
    queryKey: ["jackpot", g?.jackpotToken, g?.blockNumber.toString()],
    enabled: !!g && g.jackpotToken !== zeroAddress,
    queryFn: async () => {
      const token = await tokenState(r, g!.jackpotToken);
      const balance = await r.client.readContract({
        address: token.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [r.game.address],
        blockNumber: g!.blockNumber,
      });
      return {
        ...token,
        available: availableJackpot(
          balance,
          g!.jackpotLiability,
          g!.imdLiability,
          g!.totalStaked,
          same(token.address, g!.IMD),
          same(token.address, g!.stakingToken),
        ),
      };
    },
    retry: 1,
  });
}
