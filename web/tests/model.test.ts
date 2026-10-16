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

import { claimValue, positionTotal, exactRank } from "../src/portfolio";
import { oracleBody, intakeCall, ORACLE_PRICE } from "../src/oracle";
import {
  zeroAddress,
  stringToHex,
  decodeFunctionData,
  encodeFunctionData,
} from "viem";
import type { GameWindow, Position } from "../src/model";
const position: Position = {
  over: [0n, 4n],
  sleep: [0n, 0n],
  exactAmount: 0n,
  guess: 0n,
  imdClaimed: false,
  jackpotClaimed: false,
};
const windowFixture: GameWindow = {
  status: 2,
  startsAt: 0n,
  endsAt: 1n,
  line: 1000n,
  source: "https://sepolia.squeekchain.com",
  result: 1200n,
  pools: [11n, 0n, 0n],
  over: [1n, 10n],
  sleep: [0n, 0n],
  rewards: [10n, 0n, 0n],
  marketVoided: [false, false, false],
  paid: [6n, 0n, 0n],
  claimedWeight: [6n, 0n, 0n],
  distances: [0n, 0n, 0n],
  ties: [0n, 0n, 0n],
  rankRewards: [0n, 0n, 0n],
  rankClaimed: [0n, 0n, 0n],
  rankPaid: [0n, 0n, 0n],
  rankCount: 0,
  settler: zeroAddress,
  teamCredit: 0n,
  reimbursement: 0n,
  reimbursed: false,
  jackpotAsset: zeroAddress,
  jackpot: 0n,
  jackpotPaid: 0n,
  jackpotClaimed: 0n,
  requestId: stringToHex("", { size: 32 }),
};
test("claim preview preserves rounding, refunds, prior claims and separate credits", () => {
  const account = game as `0x${string}`,
    team = handoff.contracts.find(
      (c: { name: string }) => c.name === "OracleVerifier",
    ).address;
  assert.equal(claimValue(windowFixture, position, account, team, 0n).imd, 4n);
  const last = { ...windowFixture, rewards: [11n, 0n, 0n] as const };
  assert.equal(claimValue(last, position, account, team, 0n).imd, 5n);
  assert.equal(
    claimValue(
      windowFixture,
      { ...position, imdClaimed: true },
      account,
      team,
      0n,
    ).imd,
    0n,
  );
  const all = {
    ...position,
    over: [3n, 4n] as const,
    sleep: [1n, 2n] as const,
    exactAmount: 5n,
  };
  assert.equal(positionTotal(all), 15n);
  assert.equal(
    claimValue({ ...windowFixture, status: 3 }, all, account, team, 0n).imd,
    15n,
  );
  assert.equal(
    claimValue({ ...windowFixture, status: 1 }, all, account, team, 0n, true)
      .imd,
    15n,
  );
  assert.equal(
    claimValue(
      { ...windowFixture, marketVoided: [true, false, true] },
      all,
      account,
      team,
      0n,
    ).imd,
    10n,
  );
  assert.equal(
    claimValue(
      { ...windowFixture, settler: account },
      position,
      account,
      team,
      ORACLE_PRICE,
    ).imd,
    4n + ORACLE_PRICE,
  );
});
test("exact and jackpot last tickets collect rounding remainders, even zero shares", () => {
  const p = {
    ...position,
    over: [0n, 0n] as const,
    exactAmount: 1n,
    guess: 1200n,
  };
  const w = {
    ...windowFixture,
    rankCount: 1,
    ties: [3n, 0n, 0n] as const,
    rankRewards: [10n, 0n, 0n] as const,
    rankClaimed: [2n, 0n, 0n] as const,
    rankPaid: [6n, 0n, 0n] as const,
    jackpot: 1n,
    jackpotPaid: 0n,
    jackpotClaimed: 1n,
  };
  assert.equal(exactRank(w, p), 0);
  const value = claimValue(w, p, game, zeroAddress, 0n);
  assert.equal(value.imd, 4n);
  assert.equal(value.jackpot, 0n);
  assert.equal(value.jackpotEligible, true);
  assert.equal(
    claimValue({ ...w, jackpotClaimed: 2n }, p, game, zeroAddress, 0n).jackpot,
    1n,
  );
});
test("oracle body is exact and Intake calldata encodes the explicit consumer with no callback", () => {
  const q = "Question from question(k)";
  const body = oracleBody(q, game);
  assert.deepEqual(body, {
    v: 1,
    question: q,
    chainId: 1,
    window: { hours: 24 },
    answerType: "uint256",
    evidence: "panel",
    panelSize: 20,
    quorum: 14,
    validForSeconds: 86400,
    consumer: { chainId: 1, verifyingContract: game },
  });
  const route = {
    address: game,
    actionId: stringToHex("oracle.request@oracle-1", { size: 32 }),
    price: ORACLE_PRICE,
  };
  const call = intakeCall(route, game, body);
  const decoded = decodeFunctionData({
    abi: call.abi,
    data: encodeFunctionData(call as any),
  });
  assert.equal(decoded.functionName, "request");
  assert.equal(decoded.args?.[4], ORACLE_PRICE);
  assert.deepEqual(decoded.args?.[2], {
    target: zeroAddress,
    selector: "0x00000000",
  });
  assert.equal(streamId({ publicId: "6K_uF2s-LSw" }), "6K_uF2s-LSw");
});
test("live feed parsing: youtube live, idle, and junk ids", async () => {
  const { parseLive, parseStatus, mood, linePace } =
    await import("../src/live");
  const { playerState } = await import("../src/Stream");
  const live = parseLive({
    state: "live",
    playback: { kind: "youtube", publicId: "abcdefghijk" },
  });
  assert.deepEqual(live, {
    state: "live",
    kind: "youtube",
    publicId: "abcdefghijk",
  });
  assert.equal(playerState(live, false).mode, "live");
  const idle = parseLive({
    state: "idle",
    playback: { kind: "canonical-hls" },
  });
  assert.equal(playerState(idle, false).mode, "sleeping");
  assert.equal(
    parseLive({
      state: "live",
      playback: { kind: "youtube", publicId: "../x" },
    }).publicId,
    undefined,
  );
  assert.equal(playerState(undefined, true).mode, "fallback");
  assert.equal(playerState(undefined, true).id, "6K_uF2s-LSw");
  const status = parseStatus({
    measurement: { speedMmPerSecond: 0, cumulativeWorkUnits: "45200" },
  });
  assert.deepEqual(
    [status.speedMmPerSecond, status.cumulativeWorkUnits],
    [0, "45200"],
  );
  assert.equal(
    parseStatus({
      measurement: { speedMmPerSecond: "x", cumulativeWorkUnits: 12.7 },
    }).cumulativeWorkUnits,
    "12",
  );
  const pace = linePace(1000n)!;
  assert.ok(Math.abs(pace - 58.33) < 0.01);
  assert.equal(mood(status, 1000n), "sleeping");
  assert.equal(mood({ ...status, speedMmPerSecond: 10 }, 1000n), "stretching");
  assert.equal(mood({ ...status, speedMmPerSecond: 40 }, 1000n), "cruising");
  assert.equal(mood({ ...status, speedMmPerSecond: 70 }, 1000n), "zoomies");
  assert.equal(
    mood({ ...status, speedMmPerSecond: 70 }, 1000n, 2001n),
    "villain era",
  );
  assert.equal(
    mood({ ...status, speedMmPerSecond: 200 }, 1000n),
    "villain era",
  );
});
test("chat: draft rules, server words, escaping-safe parsing and the 200 cap", async () => {
  const { validateDraft, serverWords, parseMessages, mergeMessages, chatText } =
    await import("../src/Chat");
  assert.equal(validateDraft("  "), "Type a message first.");
  assert.equal(validateDraft("x".repeat(201)), "Keep it under 200 characters.");
  assert.equal(validateDraft("go to hamster.fun now"), "No links in chat.");
  assert.equal(validateDraft("see https://x.com"), "No links in chat.");
  assert.equal(validateDraft("0.5 IMD on OVER lol"), "");
  assert.equal(serverWords(429, {}), "Slow down: one message every 5 seconds.");
  assert.equal(serverWords(400, { error: "no links" }), "No links in chat.");
  assert.equal(
    chatText(1700000000000, "gm"),
    "Hamster Hour chat\n1700000000000\ngm",
  );
  const a = "0x1111111111111111111111111111111111111111";
  const parsed = parseMessages({
    messages: [
      { id: "1", address: a, message: "<img src=x onerror=1>", ts: 5 },
      { id: "bad", address: "nope", message: "x", ts: 6 },
    ],
    now: 7,
  });
  assert.equal(parsed.messages.length, 1);
  assert.equal(parsed.messages[0].message, "<img src=x onerror=1>");
  const many = Array.from({ length: 250 }, (_, i) => ({
    id: String(i),
    address: a,
    message: "m",
    ts: i,
  }));
  const merged = mergeMessages([], many);
  assert.equal(merged.length, 200);
  assert.equal(merged[0].id, "50");
  assert.equal(mergeMessages(merged, [many[249]]).length, 200);
});
