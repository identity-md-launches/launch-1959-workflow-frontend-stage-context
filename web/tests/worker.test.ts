import test from "node:test";
import assert from "node:assert/strict";
import { createHandler, windowSnapshot } from "../worker/index";
const windowInfo = (k: bigint) => ({
  index: k,
  status: k < 10n ? 2 : 1,
  startsAt: 1000n + k * 3600n,
  endsAt: 4600n + k * 3600n,
  closesAt: 1000n + k * 3600n,
  line: 2100n,
  over: 5n,
  under: 7n,
  yes: 8n,
  no: 9n,
  tickets: 1n,
  result: 2300n,
  jackpotPot: 12n,
  jackpotShare: 3n,
  jackpotFinalized: k < 10n,
  pendingJackpotDeposits: 5n,
});
const client = {
  getBlock: async () => ({
    number: 123n,
    hash: "0x" + "a".repeat(64),
    timestamp: 9999n,
  }),
  readContract: async ({ functionName, args, blockNumber }: any) => {
    assert.equal(blockNumber, 123n);
    return functionName === "windowInfo"
      ? windowInfo(args[0])
      : (
          {
            currentWindow: 10n,
            earliestNotStartedWindow: 11n,
            jackpotSeed: 50n,
            jackpotInFlight: 4n,
            jackpotOutstanding: 6n,
            nextFinalizeWindow: 9n,
          } as any
        )[functionName];
  },
} as any;
test("api/window reads one block and exposes contract units with unknown results null", async () => {
  const handler = createHandler({ client });
  const r = await handler.fetch(
    new Request("https://hamsterhour.fun/api/window"),
  );
  assert.equal(r.status, 200);
  const j = (await r.json()) as any;
  assert.equal(j.current.index, "10");
  assert.equal(j.current.result, null);
  assert.equal(j.recentResults[0].result, "2300");
  assert.equal(j.next.pools.snoozeNo, "9");
  assert.equal(j.closesAt, j.next.closesAt);
  assert.equal(j.blockNumber, "123");
  assert.equal(j.jackpot.carriedSeed, "50");
  assert.equal(j.recentResults.length, 10);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
});
test("stats routes proxy exact ranges and preserve upstream failures", async () => {
  const seen: string[] = [];
  const handler = createHandler({
    fetch: (async (input) => {
      seen.push(String(input));
      return new Response(
        JSON.stringify({ range: seen.at(-1)?.endsWith("7d") ? "7d" : "30d" }),
        { status: 200 },
      );
    }) as typeof fetch,
  });
  for (const range of [7, 30]) {
    const r = await handler.fetch(
      new Request(`https://hamsterhour.fun/stats${range}`),
    );
    assert.equal(r.status, 200);
    assert.ok(seen.at(-1)?.endsWith(`range=${range}d`));
  }
  const fail = createHandler({
    fetch: (async () =>
      new Response("unavailable", { status: 429 })) as typeof fetch,
  });
  assert.equal(
    (await fail.fetch(new Request("https://hamsterhour.fun/stats7"))).status,
    502,
  );
});
test("existing endpoints retain query, method and signed chat body", async () => {
  let captured: Request | undefined;
  const handler = createHandler({
    fetch: (async (req: any) => {
      captured = req;
      return new Response('{"messages":[]}');
    }) as typeof fetch,
  });
  await handler.fetch(
    new Request("https://hamsterhour.fun/chat?since=42", {
      method: "POST",
      body: "signed-chat",
      headers: { "content-type": "application/json" },
    }),
  );
  assert.equal(
    captured?.url,
    "https://hamster-hour.hamsterhour562.workers.dev/chat?since=42",
  );
  assert.equal(captured?.method, "POST");
  assert.equal(await captured?.text(), "signed-chat");
  await handler.fetch(
    new Request("https://hamsterhour.fun/chat", {
      method: "OPTIONS",
      headers: {
        origin: "https://hamsterhour.fun",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    }),
  );
  assert.equal(captured?.method, "OPTIONS");
  assert.equal(captured?.headers.get("access-control-request-method"), "POST");
  assert.equal(
    captured?.url,
    "https://hamster-hour.hamsterhour562.workers.dev/chat",
  );
});
test("write methods and missing paths fail, CORS preflight stays read-only", async () => {
  const h = createHandler({ client });
  assert.equal(
    (
      await h.fetch(
        new Request("https://hamsterhour.fun/api/window", { method: "POST" }),
      )
    ).status,
    405,
  );
  assert.equal(
    (await h.fetch(new Request("https://hamsterhour.fun/nope"))).status,
    404,
  );
  assert.equal(
    (
      await h.fetch(
        new Request("https://hamsterhour.fun/api/window", {
          method: "OPTIONS",
        }),
      )
    ).status,
    204,
  );
});
test("RPC failure returns unavailable rather than invented zero-valued pools", async () => {
  const h = createHandler({
    client: {
      getBlock: async () => {
        throw Error("offline");
      },
    } as any,
  });
  const r = await h.fetch(new Request("https://hamsterhour.fun/api/window"));
  assert.equal(r.status, 503);
  assert.equal("pools" in (await r.json()), false);
});
