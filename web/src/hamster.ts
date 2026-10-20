import { useQuery } from "@tanstack/react-query";
import { erc20Abi, type Abi, type Address } from "viem";
import type { Runtime } from "./config";
import type { TransactionTarget } from "./transactions";
import vaultAbi from "../contracts/HamsterVault.json";
import hookAbi from "../contracts/HamsterHook.json";
// Addresses given by the $HAMSTER assignment (Ethereum mainnet). The vault ABI is
// abi/HamsterVault.json from launch-2304 at 69ca386; the hook ABI holds only the
// public getters of src/HamsterHook.sol from launch-2336 at bf12d71.
export const HAMSTER = {
  token: "0x8e7c7936b4f2d4475dc4bacd174dc228d4d24e86" as Address,
  vault: "0x1dceb78b36b5f18ac4a130f1ffc76eba0e73d183" as Address,
  hook: "0x82f636a92364d13754d7b3e72d460f0be20a28cc" as Address,
  vaultAbi: vaultAbi as Abi,
  hookAbi: hookAbi as Abi,
};
export const uniswapUrl = (imd: Address) =>
  `https://app.uniswap.org/swap?chain=mainnet&inputCurrency=${imd}&outputCurrency=${HAMSTER.token}`;
// The hook's schedule: 95% at pool start, minus 2 points per full minute, zero from minute 48.
export const TAX_START = 95,
  TAX_STEP = 2,
  TAX_MINUTES = 48;
export function buyTax(startedAt: bigint, now: number) {
  if (startedAt === 0n) return { tax: 0, live: false, endsIn: 0 };
  const elapsed = Math.max(0, now - Number(startedAt));
  const minutes = Math.floor(elapsed / 60);
  const live = minutes < TAX_MINUTES;
  return {
    tax: live ? TAX_START - TAX_STEP * minutes : 0,
    live,
    endsIn: live ? Number(startedAt) + TAX_MINUTES * 60 - now : 0,
    nextStepIn: live ? 60 - (elapsed % 60) : 0,
  };
}
export const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    r = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
};
export const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );
// Per transaction; the vault's own MAX_BATCH is 32, smaller batches keep gas predictable.
export const BATCH = 16;
export const HALF_LOSS = 18_750n * 10n ** 18n;
export function revertName(e: unknown) {
  let x: any = e;
  for (let i = 0; x && i < 12; i++, x = x.cause) {
    if (x.data?.errorName) return x.data.errorName as string;
    const m =
      /(NotFinalized|CheckpointRequired|BadLossHistory|UnknownGame)/.exec(
        String(x.shortMessage ?? x.message ?? ""),
      );
    if (m) return m[1];
  }
  return undefined;
}
const vaultRead =
  (r: Runtime, blockNumber?: bigint) =>
  <T>(functionName: string, args: readonly unknown[] = []) =>
    r.client.readContract({
      address: HAMSTER.vault,
      abi: HAMSTER.vaultAbi,
      functionName,
      args,
      blockNumber,
    }) as Promise<T>;
export async function verifyHamster(r: Runtime) {
  const read = vaultRead(r);
  const [token, game, hookToken, hookVault, symbol] = await Promise.all([
    read<Address>("token"),
    read<Address>("GAME_V2"),
    r.client.readContract({
      address: HAMSTER.hook,
      abi: HAMSTER.hookAbi,
      functionName: "token",
    }) as Promise<Address>,
    r.client.readContract({
      address: HAMSTER.hook,
      abi: HAMSTER.hookAbi,
      functionName: "VAULT",
    }) as Promise<Address>,
    r.client.readContract({
      address: HAMSTER.token,
      abi: erc20Abi,
      functionName: "symbol",
    }),
  ]);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (
    !same(token, HAMSTER.token) ||
    !same(game, r.game.address) ||
    !same(hookToken, HAMSTER.token) ||
    !same(hookVault, HAMSTER.vault) ||
    symbol !== "HAMSTER"
  )
    throw Error("HAMSTER contract verification failed. Actions are disabled.");
  return true;
}
export const vaultTarget = (r: Runtime): TransactionTarget => ({
  address: HAMSTER.vault,
  abi: HAMSTER.vaultAbi,
  token: HAMSTER.token,
  symbol: "HAMSTER",
  verify: () => verifyHamster(r),
});
export const useHamsterVerification = (r: Runtime) =>
  useQuery({
    queryKey: ["hamster-verification"],
    queryFn: () => verifyHamster(r),
    staleTime: 60000,
    refetchInterval: 60000,
    retry: 1,
  });
export async function loadHamsterGlobal(r: Runtime) {
  const block = await r.client.getBlock();
  const read = vaultRead(r, block.number);
  const [mining, buckets, totalStaked, rewardsPaid, startedAt] =
    await Promise.all([
      read<readonly [bigint, bigint, bigint]>("currentMiningState"),
      read<readonly [bigint, bigint, bigint, bigint]>("bucketsLeft"),
      read<bigint>("totalStaked"),
      read<bigint>("rewardsPaid"),
      r.client.readContract({
        address: HAMSTER.hook,
        abi: HAMSTER.hookAbi,
        functionName: "startedAt",
        blockNumber: block.number,
      }) as Promise<bigint>,
    ]);
  const [globalLoss, rate, halving] = mining;
  return {
    globalLoss,
    rate,
    halving,
    nextHalvingIn: (halving + 1n) * HALF_LOSS - globalLoss,
    miningLeft: buckets[0],
    miningReserved: buckets[1],
    boostLeft: buckets[2],
    boostReserved: buckets[3],
    totalStaked,
    rewardsPaid,
    startedAt,
  };
}
export const useHamsterGlobal = (r: Runtime) =>
  useQuery({
    queryKey: ["hamster-global"],
    queryFn: () => loadHamsterGlobal(r),
    refetchInterval: 20000,
    retry: 1,
  });
const LIMIT = 200n;
const upTo = (n: bigint) =>
  Array.from({ length: Number(n < LIMIT ? n : LIMIT) }, (_, i) => BigInt(i));
export async function loadHamsterAccount(r: Runtime, account: Address) {
  const block = await r.client.getBlock();
  const read = vaultRead(r, block.number);
  const token = (functionName: "balanceOf" | "allowance", args: unknown[]) =>
    r.client.readContract({
      address: HAMSTER.token,
      abi: erc20Abi,
      functionName,
      args,
      blockNumber: block.number,
    } as any) as Promise<bigint>;
  const [counts, balance, allowance, staked, granted] = await Promise.all([
    read<readonly [bigint, bigint, bigint]>("positionCounts", [account]),
    token("balanceOf", [account]),
    token("allowance", [account, HAMSTER.vault]),
    read<bigint>("stakedBalance", [account]),
    read<bigint>("grantBalance", [account]),
  ]);
  let pending: bigint | undefined;
  try {
    pending = await read<bigint>("pendingIMD", [account]);
  } catch (e) {
    if (revertName(e) !== "CheckpointRequired") throw e;
  }
  const [lots, grants, unstakes] = await Promise.all([
    Promise.all(
      upTo(counts[0]).map(async (id) => {
        const [amount, activation, isGrant] = await read<
          readonly [bigint, bigint, boolean]
        >("lots", [account, id]);
        const [at] = await read<readonly [bigint, bigint, bigint]>(
          "activations",
          [activation],
        );
        return { id, amount, earnsAt: at, isGrant };
      }),
    ),
    Promise.all(
      upTo(counts[1]).map(async (id) => {
        const [[amount, withdrawn, startsAt], vested] = await Promise.all([
          read<readonly [bigint, bigint, bigint, bigint]>("grants", [
            account,
            id,
          ]),
          read<bigint>("vested", [account, id]),
        ]);
        return {
          id,
          amount,
          withdrawn,
          startsAt,
          vested,
          locked: amount - vested,
          due: vested - withdrawn,
        };
      }),
    ),
    Promise.all(
      upTo(counts[2]).map(async (id) => {
        const [amount, readyAt, withdrawn] = await read<
          readonly [bigint, bigint, boolean]
        >("unstakeQueue", [account, id]);
        return { id, amount, readyAt, withdrawn };
      }),
    ),
  ]);
  return {
    balance,
    allowance,
    staked,
    granted,
    pending,
    lots,
    grants,
    unstakes,
    timestamp: block.timestamp,
  };
}
export const useHamsterAccount = (r: Runtime, account?: Address) =>
  useQuery({
    queryKey: ["hamster-account", account],
    queryFn: () => loadHamsterAccount(r, account!),
    enabled: !!account,
    refetchInterval: 20000,
    retry: 1,
  });
export type MineRow = {
  k: bigint;
  loss: bigint;
  amount?: bigint;
  mined: boolean;
  waiting?: string;
};
export async function loadMined(
  r: Runtime,
  account: Address,
  losses: { k: bigint; loss: bigint }[],
): Promise<MineRow[]> {
  const block = await r.client.getBlock();
  const read = vaultRead(r, block.number);
  return Promise.all(
    losses.map(async ({ k, loss }) => {
      const mined = await read<boolean>("mined", [r.game.address, k, account]);
      if (mined) return { k, loss, mined, amount: 0n };
      try {
        const amount = await read<bigint>("claimable", [
          r.game.address,
          k,
          account,
        ]);
        return { k, loss, mined, amount };
      } catch (e) {
        const name = revertName(e);
        if (!name) throw e;
        return {
          k,
          loss,
          mined,
          waiting:
            name === "NotFinalized"
              ? "Waiting for the hour to finalize"
              : "Not claimable yet",
        };
      }
    }),
  );
}
