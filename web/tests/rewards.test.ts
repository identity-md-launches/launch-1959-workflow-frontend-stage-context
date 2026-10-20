import { test } from "node:test";
import assert from "node:assert/strict";
import type { Runtime } from "../src/config";
import {
  dailyRelease,
  estimatedApr,
  hamsterPriceInImd,
  loadRewards,
  loadRewardWeight,
  personalDaily,
  RAY,
  selectImdUsd,
  stakeShare,
  type RewardState,
} from "../src/rewards";

const W = 10n ** 18n;
const imd = "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7";
const state: RewardState = {
  weight: 1000n * W,
  hookRate: (7n * W * RAY) / 86400n,
  gameRate: (3n * W * RAY) / 86400n,
  dripPrincipal: 1200n * W,
  dripReleased: 200n * W,
  activationCursor: 10n,
};
function runtime(values: Record<string, unknown>, calls: any[] = []) {
  return {
    client: {
      getBlock: async () => ({ number: 123n, timestamp: 1000n }),
      readContract: async (call: any) => {
        calls.push(call);
        const value = values[call.functionName];
        if (value instanceof Error) throw value;
        if (typeof value === "function") return value(call.args);
        assert.notEqual(value, undefined, call.functionName);
        return value;
      },
    },
  } as unknown as Runtime;
}
test("waiting pool uses all three deposits less paid at a single block", async () => {
  const calls: any[] = [];
  const g = await loadRewards(
    runtime(
      {
        dripDeposited: 1200n * W,
        hookDeposited: 700n * W,
        gameDeposited: 300n * W,
        rewardsPaid: 200n * W,
        totalStaked: 800n * W,
        totalGrantBalance: 200n * W,
        rewardState: state,
      },
      calls,
    ),
  );
  assert.equal(g.waiting, 2000n * W);
  assert.equal(g.totalStaked, 1000n * W);
  assert.ok(calls.every((c) => c.blockNumber === 123n));
  assert.ok(g.daily! >= 20n * W - 1n && g.daily! <= 20n * W);
});
test("a checkpoint failure preserves the pool but leaves release unknown", async () => {
  const g = await loadRewards(
    runtime({
      dripDeposited: W,
      hookDeposited: 0n,
      gameDeposited: 0n,
      rewardsPaid: 0n,
      totalStaked: W,
      totalGrantBalance: 0n,
      rewardState: Error("CheckpointRequired"),
    }),
  );
  assert.equal(g.waiting, W);
  assert.equal(g.daily, undefined);
});
test("drip uses remaining principal; expired stream rates and zero weight release nothing", () => {
  assert.equal(dailyRelease({ ...state, hookRate: 0n, gameRate: 0n }), 10n * W);
  assert.equal(dailyRelease({ ...state, weight: 0n }), 0n);
  assert.equal(
    dailyRelease({
      ...state,
      dripReleased: state.dripPrincipal,
      hookRate: 0n,
      gameRate: 0n,
    }),
    0n,
  );
});
test("shares count matured lots and grants, exclude warm-up, and use the reward snapshot", async () => {
  const calls: any[] = [];
  const r = runtime(
    {
      accounts: [100n * W, 0n, 0n, 0n, 1n],
      positionCounts: [3n, 0n, 0n],
      lots: ([, id]: [string, bigint]) =>
        id === 1n ? [150n * W, 9n, true] : [200n * W, 10n, false],
    },
    calls,
  );
  const weight = await loadRewardWeight(
    r,
    {
      blockNumber: 123n,
      state,
      totalStaked: 1000n * W,
      waiting: 2000n * W,
      daily: 20n * W,
    },
    imd,
  );
  assert.equal(weight, 250n * W);
  assert.equal(stakeShare(weight, state.weight), 25);
  assert.equal(personalDaily(20n * W, weight, state.weight), 5n * W);
  assert.equal(stakeShare(0n, 0n), 0);
  assert.equal(personalDaily(W, 0n, 0n), 0n);
  assert.ok(calls.every((c) => c.blockNumber === 123n));
});
test("account checkpoint limits produce an error rather than a partial stake share", async () => {
  await assert.rejects(
    () =>
      loadRewardWeight(
        runtime({
          accounts: [W, 0n, 0n, 0n, 0n],
          positionCounts: [129n, 0n, 0n],
        }),
        { blockNumber: 123n, state } as any,
        imd,
      ),
    /checkpoint/i,
  );
});
test("pool sqrt price respects currency order; APR annualizes USD release without compounding", () => {
  assert.equal(hamsterPriceInImd(2n ** 95n, imd), 0.25);
  assert.equal(
    hamsterPriceInImd(2n ** 95n, "0x1111111111111111111111111111111111111111"),
    4,
  );
  assert.throws(() => hamsterPriceInImd(0n, imd));
  assert.equal(estimatedApr(20n * W, 1000n * W, 0.25, 2), 2920);
  assert.equal(estimatedApr(20n * W, 1000n * W, 0.25, 20), 2920);
  assert.equal(estimatedApr(0n, 1000n * W, 0.25, 2), 0);
  assert.equal(estimatedApr(W, 0n, 0.25, 2), undefined);
  assert.equal(estimatedApr(W, W, 0, 2), undefined);
});
test("USD selects the liquid Ethereum IMD base pair and rejects bad or unrelated prices", () => {
  const pair = (
    address: string,
    priceUsd: string,
    liquidity: number,
    chainId = "ethereum",
  ) => ({
    chainId,
    baseToken: { address },
    priceUsd,
    liquidity: { usd: liquidity },
  });
  assert.equal(
    selectImdUsd(
      {
        pairs: [
          pair(imd, "3", 10),
          pair(imd, "2", 20),
          pair(imd, "999", 9999, "base"),
          pair("0x1111111111111111111111111111111111111111", "999", 9999),
          pair(imd, "0", 9999),
          pair(imd, "NaN", 9999),
        ],
      },
      imd,
    ),
    2,
  );
  assert.throws(() => selectImdUsd({ pairs: [] }, imd));
});
