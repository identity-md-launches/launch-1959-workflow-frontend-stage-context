import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEther, maxUint256 } from "viem";
import {
  amount,
  uint,
  units,
  winnersPool,
  payoutMultiple,
  availableJackpot,
  defaultWindow,
  parseAttestation,
  uuidFromBytes32,
  bytes32FromId,
  errorText,
} from "../src/model";
import { abiHash } from "../src/config";
import { streamId } from "../src/Stream";
const handoff = JSON.parse(
  readFileSync(new URL("../deployment/handoff.json", import.meta.url), "utf8"),
);
const game = handoff.contracts.find(
  (c: { name: string }) => c.name === "HamsterHour",
).address;
test("pinned implementation ABI canonical hashes agree with handoff", () => {
  for (const c of handoff.contracts) {
    const abi = JSON.parse(
      readFileSync(
        new URL("../../docs/abi/" + c.name + ".json", import.meta.url),
        "utf8",
      ),
    );
    assert.equal(abiHash(abi), c.abiHash);
    assert.notEqual(abiHash(abi.slice(1)), c.abiHash);
  }
});
test("token parsing preserves precision and rejects rounding, exponent, sign and overflow", () => {
  assert.equal(amount("0.5", 18), 500000000000000000n);
  assert.equal(amount("1.234567", 6), 1234567n);
  for (const v of ["0", "-1", "1e3", ".5", "1.0000001", "NaN", "Infinity", ""])
    assert.throws(() => amount(v, 6));
  assert.throws(() => amount((maxUint256 + 1n).toString(), 0));
  assert.equal(uint(maxUint256.toString()), maxUint256);
  assert.throws(() => uint((maxUint256 + 1n).toString()));
  assert.throws(() => uint("18446744073709551616", 64));
});
test("binary estimate uses contract fee floors and one-sided refunds", () => {
  assert.equal(winnersPool(101n), 92n);
  assert.equal(
    payoutMultiple(parseEther("100"), parseEther("50"), parseEther("50")),
    "1.82×",
  );
  assert.equal(payoutMultiple(100n, 100n, 0n), "Refund if one-sided");
  for (let p = 0n; p < 10000n; p += 13n) {
    const winner = winnersPool(p);
    assert.equal(winner + (p * 5n) / 100n + (p * 3n) / 100n + p / 100n, p);
  }
});
test("available jackpot subtracts every overlapping liability and never goes negative", () => {
  assert.equal(availableJackpot(100n, 10n, 20n, 30n, true, true), 40n);
  assert.equal(availableJackpot(100n, 10n, 20n, 30n, false, false), 90n);
  assert.equal(availableJackpot(1n, 10n, 20n, 30n, true, true), 0n);
});
test("window default handles pregenesis and genesis floor", () => {
  assert.equal(defaultWindow(0n, false, 0n), 0n);
  assert.equal(defaultWindow(10n, true, 0n), 11n);
  assert.equal(defaultWindow(10n, true, 50n), 50n);
});
test("token formatting does not show tiny nonzero amounts as zero", () => {
  assert.equal(units(1n, 18), "<0.0001");
  assert.equal(units(undefined), "Unavailable");
  assert.equal(units(parseEther("123456789.125")), "123,456,789.125");
});
test("oracle UUID bytes are preserved, not hashed or mistaken for a transaction", () => {
  const id = "753b4996-34e7-420a-8768-d784231195da";
  assert.equal(uuidFromBytes32(bytes32FromId(id)), id);
  assert.throws(() => uuidFromBytes32("0x" + "01".repeat(32)));
});
test("attestation parser rejects wrong consumer, unsafe numbers and malformed bytes", () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL(
        "../../docs/references/squeekchain-attestation.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.throws(
    () => parseAttestation(JSON.stringify(fixture), 1, game),
    /different consumer/,
  );
  fixture.domain.verifyingContract = game;
  const parsed = parseAttestation(JSON.stringify(fixture), 1, game);
  assert.equal(parsed.result, 1470n);
  assert.equal(parsed.attestation.answerType, 3);
  fixture.message.figure = 9007199254740992;
  assert.throws(
    () => parseAttestation(JSON.stringify(fixture), 1, game),
    /loses precision/,
  );
  fixture.message.figure = "9007199254740992";
  fixture.message.answer = "0x1";
  assert.throws(
    () => parseAttestation(JSON.stringify(fixture), 1, game),
    /32-byte/,
  );
});
test("stream only accepts a valid YouTube id from the designated feed", () => {
  assert.equal(streamId({ youtubeId: "abcdefghijk" }), "abcdefghijk");
  assert.equal(
    streamId({ url: "https://www.youtube.com/watch?v=abcdefghijk" }),
    "abcdefghijk",
  );
  assert.throws(() => streamId({ url: "https://evil.example/?v=abcdefghijk" }));
  assert.throws(() => streamId({ id: "fake" }));
});
test("wallet and ABI reverts map to useful messages", () => {
  assert.match(errorText({ cause: { code: 4001 } }), /declined/);
  assert.match(
    errorText({ data: { errorName: "DuplicateExactBet" } }),
    /already have/,
  );
  assert.match(
    errorText(new Error("https://private.example/credential")),
    /could not complete/,
  );
});
