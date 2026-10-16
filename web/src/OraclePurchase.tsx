import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { erc20Abi, type Address, type Hex } from "viem";
import { reader, loadWindow } from "./data";
import { errorText } from "./model";
import { useTransactions } from "./transactions";
import { Action, ErrorNote } from "./ui";
import { services } from "./config";
import {
  fetchJSON,
  intakeCall,
  intakeProgress,
  intakeRoute,
  isUUID,
  oracleBody,
  ORACLE_PRICE,
  validateAttestation,
} from "./oracle";
import type { PageProps } from "./Bet";
type Saved = { tx: Hex; intake: Address; payer: Address };
export function OraclePurchase({
  r,
  g,
  ready,
  now,
  k,
  question,
  canBuy,
  onAnswer,
}: PageProps & {
  k: bigint;
  question?: string;
  canBuy: boolean;
  onAnswer: (text: string) => void;
}) {
  const { address } = useConnection(),
    { send, busy, states } = useTransactions();
  const [failed, setFailed] = useState<Hex>();
  const [phase, setPhase] = useState(""),
    [error, setError] = useState("");
  const [saved, setSaved] = useState<Saved>();
  const locked = useRef(false),
    delivered = useRef("");
  const storageKey = `hamster-hour:oracle:${r.game.address}:${k}`;
  useEffect(() => {
    setSaved(undefined);
    delivered.current = "";
    setError("");
    try {
      const s = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (
        s &&
        /^0x[\da-f]{64}$/i.test(s.tx) &&
        /^0x[\da-f]{40}$/i.test(s.intake) &&
        /^0x[\da-f]{40}$/i.test(s.payer)
      )
        setSaved(s);
    } catch {
      /* storage is optional */
    }
  }, [storageKey]);
  function remember(value: Saved) {
    setSaved(value);
    setFailed(undefined);
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* still track this visit */
    }
  }
  // A reverted or cancelled payment is not a purchase: drop it, show the failed
  // receipt and bring the Buy button back.
  const payment = states["oracle-buy"];
  useEffect(() => {
    if (saved && payment?.phase === "error" && payment.hash === saved.tx) {
      setSaved(undefined);
      setFailed(payment.hash);
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* nothing saved */
      }
    }
  }, [saved, payment, storageKey]);
  const progress = useQuery({
    queryKey: ["oracle-purchase", saved?.tx],
    enabled: !!saved,
    queryFn: () => intakeProgress(saved!.tx, saved!.intake, saved!.payer),
    refetchInterval: 15000,
    retry: false,
  });
  const uuid = progress.data?.uuid;
  const panel = useQuery({
    queryKey: ["oracle-panel", uuid],
    enabled: !!uuid,
    queryFn: async () => {
      const x = await fetchJSON(`/oracle/requests/${uuid}`);
      const job = x.jobId ?? x.request?.jobId;
      return isUUID(job) ? job : undefined;
    },
    refetchInterval: 15000,
    retry: false,
  });
  const answer = useQuery({
    queryKey: ["oracle-answer", uuid, k.toString()],
    enabled: !!uuid && canBuy,
    queryFn: async () => {
      const response = await fetch(
        `${services.oracleAPI}/oracle/requests/${uuid}/attestation`,
        { signal: AbortSignal.timeout(15000) },
      );
      if (response.status === 404) return null;
      if (!response.ok)
        throw Error(
          "The oracle answer could not refresh. We will try again in 15 seconds.",
        );
      const text = await response.text();
      await validateAttestation(r, k, text, now);
      return text;
    },
    refetchInterval: (q) => (q.state.data ? false : 15000),
    retry: false,
  });
  useEffect(() => {
    if (answer.data && delivered.current !== answer.data) {
      delivered.current = answer.data;
      onAnswer(answer.data);
    }
  }, [answer.data, onAnswer]);
  async function buy() {
    if (locked.current || busy) return;
    locked.current = true;
    setError("");
    try {
      if (!canBuy || !ready || !address || !g || saved)
        throw Error(
          "Load a finished window with bets before buying an answer.",
        );
      setPhase("Checking the oracle request…");
      const snapshot = await loadWindow(r, k, address);
      const block = await r.client.getBlock();
      if (
        snapshot.window.status !== 1 ||
        block.timestamp < snapshot.times[1] ||
        block.timestamp >= snapshot.times[1] + g.TIMEOUT ||
        snapshot.window.pools.every((p) => p === 0n)
      )
        throw Error("This window is not eligible for an oracle purchase.");
      const exactQuestion = await reader(r)<string>("question", [k]);
      const body = oracleBody(exactQuestion, r.game.address);
      const check = await fetchJSON("/requests/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "oracle.request", input: body }),
      });
      if (!Array.isArray(check.blockers) || check.blockers.length)
        throw Error(
          "The oracle preflight did not accept this question. Review it before paying.",
        );
      const route = await intakeRoute(r, g.IMD);
      const [balance, allowance] = await Promise.all([
        r.client.readContract({
          address: g.IMD,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }),
        r.client.readContract({
          address: g.IMD,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, route.address],
        }),
      ]);
      if (balance < ORACLE_PRICE)
        throw Error("You need 0.5 IMD to buy this oracle answer.");
      if (allowance < ORACLE_PRICE) {
        setPhase("Approving 0.5 IMD…");
        if (
          allowance > 0n &&
          !(await send("oracle-buy", {
            address: g.IMD,
            abi: erc20Abi,
            functionName: "approve",
            args: [route.address, 0n],
          }))
        )
          return;
        if (
          !(await send("oracle-buy", {
            address: g.IMD,
            abi: erc20Abi,
            functionName: "approve",
            args: [route.address, ORACLE_PRICE],
          }))
        )
          return;
      }
      const latest = await loadWindow(r, k, address);
      if (
        latest.window.status !== 1 ||
        latest.timestamp >= latest.times[1] + g.TIMEOUT
      )
        throw Error(
          "This window was closed or its deadline passed while you approved. The oracle has not been paid.",
        );
      setPhase("Buying oracle answer…");
      await send("oracle-buy", {
        ...intakeCall(route, g.IMD, body),
        onSubmitted: (tx) =>
          remember({ tx, intake: route.address, payer: address }),
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      locked.current = false;
      setPhase("");
    }
  }
  const job = progress.data?.job ?? panel.data;
  return (
    <section className="oracle-purchase">
      <h3>1. Buy oracle answer</h3>
      <p>
        0.5 IMD plus Ethereum network fees. A panel of 20 checks the result; 14
        must agree.
      </p>
      {!saved ? (
        <>
          {failed && (
            <div className="notice error" role="status">
              <p>
                The oracle payment did not go through: the transaction reverted
                or was cancelled, so nothing was paid. You can buy again.
              </p>
              <a
                href={`${r.deployment.network.explorer}/tx/${failed}`}
                target="_blank"
                rel="noreferrer"
              >
                View failed receipt ↗
              </a>
            </div>
          )}
          <Action
            r={r}
            id="oracle-buy"
            label="Buy oracle answer · 0.5 IMD"
            disabled={!canBuy || !ready || !question || !!phase}
            reason="Only ended windows with bets, within the 48-hour deadline, can buy an answer."
            onClick={() => void buy()}
          />
        </>
      ) : (
        <div className="notice">
          <p role="status">
            {answer.data
              ? "Verified answer received. Ready to settle."
              : (progress.data?.state ?? "Following your saved purchase…")}
          </p>
          <a
            href={`${r.deployment.network.explorer}/tx/${saved.tx}`}
            target="_blank"
            rel="noreferrer"
          >
            View payment
          </a>
          {job && (
            <a
              href={`${services.oracleExplorer}/jobs/${job}`}
              target="_blank"
              rel="noreferrer"
            >
              View oracle panel
            </a>
          )}
          {uuid && (
            <a
              href={`${services.oracleAPI}/oracle/requests/${uuid}/attestation`}
              target="_blank"
              rel="noreferrer"
            >
              Oracle result JSON
            </a>
          )}
          <p className="small muted">
            Checks every 15 seconds. You can leave and return on this device.
          </p>
          <button
            onClick={() => {
              void progress.refetch();
              void panel.refetch();
              if (uuid) void answer.refetch();
            }}
          >
            Check now
          </button>
        </div>
      )}
      <p role="status">{phase}</p>
      <ErrorNote
        message={
          error ||
          (progress.isError
            ? errorText(progress.error)
            : answer.isError
              ? errorText(answer.error)
              : "")
        }
      />
      <p className="small muted">
        Payment is not refundable and an answer is not guaranteed. The
        successful settler can claim a 0.5 IMD reimbursement from the game’s
        oracle reserve when it is funded.
      </p>
      {question && (
        <details>
          <summary>Review request body</summary>
          <pre>
            {JSON.stringify(oracleBody(question, r.game.address), null, 2)}
          </pre>
        </details>
      )}
    </section>
  );
}
