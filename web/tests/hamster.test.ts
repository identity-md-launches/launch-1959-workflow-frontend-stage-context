import { test } from "node:test";
import assert from "node:assert/strict";
import { keccak256, toBytes } from "viem";
import {
  buyTax,
  chunks,
  clock,
  uniswapUrl,
  HAMSTER,
  revertName,
} from "../src/hamster";
import { canonical } from "../src/config";
test("anti-snipe tax follows the hook schedule", () => {
  assert.equal(buyTax(0n, 5000).live, false);
  assert.equal(buyTax(1000n, 1000).tax, 95);
  assert.equal(buyTax(1000n, 1059).tax, 95);
  assert.equal(buyTax(1000n, 1060).tax, 93);
  assert.equal(buyTax(1000n, 1000 + 47 * 60).tax, 1);
  assert.deepEqual(
    [buyTax(1000n, 1000 + 48 * 60).tax, buyTax(1000n, 1000 + 48 * 60).live],
    [0, false],
  );
  assert.equal(buyTax(1000n, 1000).endsIn, 48 * 60);
});
test("claims are split into bounded batches", () => {
  assert.deepEqual(chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunks([], 16), []);
});
test("countdown and swap link", () => {
  assert.equal(clock(1672), "27:52");
  assert.equal(clock(-3), "00:00");
  const url = new URL(uniswapUrl("0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7"));
  assert.equal(url.host, "app.uniswap.org");
  assert.equal(url.searchParams.get("chain"), "mainnet");
  assert.equal(url.searchParams.get("outputCurrency"), HAMSTER.token);
});
test("vault ABI matches the pinned launch-2304 export", () => {
  const hash = keccak256(toBytes(JSON.stringify(canonical(HAMSTER.vaultAbi))));
  assert.equal(
    hash.slice(2),
    "d125b46bede309d06e67697d5e81b2c6e1fc63ad319ced9d9f346605b855de81",
  );
  for (const fn of [
    "claimMined",
    "claimable",
    "withdrawVested",
    "stake",
    "requestUnstake",
    "withdrawUnstaked",
    "pendingIMD",
    "claimRewards",
    "currentMiningState",
    "bucketsLeft",
  ])
    assert.ok(
      HAMSTER.vaultAbi.some((x: any) => x.name === fn),
      fn,
    );
});
test("known vault reverts are recognised", () => {
  assert.equal(
    revertName({ cause: { data: { errorName: "NotFinalized" } } }),
    "NotFinalized",
  );
  assert.equal(revertName(new Error("boom")), undefined);
});
