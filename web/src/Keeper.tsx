import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { erc20Abi } from "viem";
import { reader, useToken, useWindow } from "./data";
import {
  amount,
  uint,
  parseAttestation,
  errorText,
  dateTime,
  units,
} from "./model";
import { useTransactions } from "./transactions";
import { Action, Field, ErrorNote, Stat } from "./ui";
import { OraclePurchase } from "./OraclePurchase";
import { validateAttestation } from "./oracle";
import type { PageProps } from "./Bet";
export function Keeper({
  r,
  g,
  ready,
  now,
  initialWindow,
}: PageProps & { initialWindow?: bigint }) {
  const { address } = useConnection();
  const [input, setInput] = useState(""),
    [selected, setSelected] = useState<bigint>(),
    [attestation, setAttestation] = useState(""),
    [fund, setFund] = useState(""),
    [error, setError] = useState("");
  const k = selected ?? initialWindow;
  useEffect(() => {
    setAttestation("");
    setError("");
  }, [k]);
  const w = useWindow(r, k, address);
  const token = useToken(r, g?.IMD, address);
  const { send } = useTransactions();
  const question = useQuery({
    queryKey: ["question", k?.toString(), w.data?.window.status],
    enabled: k !== undefined && !!w.data && w.data.window.status !== 0,
    queryFn: () => reader(r)<string>("question", [k]),
    retry: false,
  });
  const timestamp = BigInt(Math.floor(now / 1000));
  const valid =
    ready &&
    !!w.data &&
    !w.isError &&
    Date.now() - w.dataUpdatedAt < 45000 &&
    w.data.window.status === 1;
  const canSettle =
    valid &&
    w.data!.window.pools.some((p) => p > 0n) &&
    timestamp >= w.data!.times[1] &&
    !!g &&
    timestamp < w.data!.times[1] + g.TIMEOUT;
  const canVoid = valid && !!g && timestamp >= w.data!.times[1] + g.TIMEOUT;
  let donate = 0n;
  try {
    donate = amount(fund, token.data?.decimals ?? 18);
  } catch {
    /* validated on click */
  }
  const approval =
    token.data?.allowance !== undefined && token.data.allowance < donate;
  const reset = approval && token.data?.allowance !== 0n;
  let preview: ReturnType<typeof parseAttestation> | undefined;
  try {
    if (attestation.trim())
      preview = parseAttestation(attestation, r.chain.id, r.game.address);
  } catch {
    /* Report invalid data on submission. */
  }
  async function settle() {
    try {
      setError("");
      if (!canSettle || k === undefined)
        throw Error("Load an ended window within its settlement period.");
      const a = await validateAttestation(r, k, attestation, now);
      await send("settle", {
        functionName: "settle",
        args: [k, a.attestation, a.signature],
      });
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function fundReserve() {
    try {
      setError("");
      if (!g || !token.data || token.data.balance === undefined)
        throw Error("Wait for the current IMD balance.");
      const value = amount(fund, token.data.decimals);
      if (value > token.data.balance)
        throw Error("This exceeds your IMD balance.");
      await send(
        "fund",
        approval
          ? {
              address: g.IMD,
              abi: erc20Abi,
              functionName: "approve",
              args: [r.game.address, reset ? 0n : value],
            }
          : { functionName: "fundOracleReserve", args: [value] },
      );
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <section className="keeper section">
      <h3>Permissionless settlement</h3>
      <p>
        Supply a signed IMD result after all six rounds end. The contract checks
        the signature, question, panel, validity and replay protection. Buy an
        answer below, or paste one you already have.
      </p>
      <div className="input-row">
        <Field label="Window to settle" id="keeper-window">
          <input
            id="keeper-window"
            inputMode="numeric"
            value={input}
            placeholder={k?.toString()}
            onChange={(e) => setInput(e.target.value)}
          />
        </Field>
        <button
          onClick={() => {
            try {
              setSelected(uint(input, 64));
              setError("");
            } catch (e) {
              setError(errorText(e));
            }
          }}
        >
          Load settlement
        </button>
      </div>
      {k !== undefined && (
        <>
          <p>
            Window {k.toString()} · Ends {dateTime(w.data?.times[1])}
          </p>
          <p className="small muted">
            Timeout{" "}
            {w.data && g
              ? dateTime(w.data.times[1] + g.TIMEOUT)
              : "unavailable"}
          </p>
          {question.data && (
            <blockquote className="question">{question.data}</blockquote>
          )}
          {question.isError && (
            <p className="error">
              The oracle question could not load. Refresh before requesting an
              attestation.
            </p>
          )}
        </>
      )}
      {k !== undefined && (
        <OraclePurchase
          key={String(k)}
          r={r}
          g={g}
          ready={ready}
          now={now}
          k={k}
          question={question.data}
          canBuy={canSettle}
          onAnswer={setAttestation}
        />
      )}
      <h3>2. Settle with the signed result</h3>
      <Field
        label="Signed attestation JSON (manual fallback)"
        id="attestation"
        hint="Paste the public API response containing message (or attestation), domain and signature. Keep large integers as decimal strings."
      >
        <textarea
          id="attestation"
          rows={7}
          value={attestation}
          onChange={(e) => setAttestation(e.target.value)}
          spellCheck={false}
        />
      </Field>
      {preview && (
        <dl className="key-values">
          <div>
            <dt>Signed result</dt>
            <dd>{preview.result.toString()} passes</dd>
          </div>
          <div>
            <dt>Panel agreement</dt>
            <dd>
              {String(preview.attestation.agreed)} /{" "}
              {String(preview.attestation.panelSize)} (quorum{" "}
              {String(preview.attestation.quorum)})
            </dd>
          </div>
          <div>
            <dt>Valid through</dt>
            <dd>{dateTime(preview.attestation.expiresAt as bigint)}</dd>
          </div>
        </dl>
      )}
      <ErrorNote message={error} />
      <Action
        r={r}
        id="settle"
        label="Settle"
        disabled={!canSettle || !question.data || question.isError || !preview}
        reason="Load a funded, ended window before its 48-hour timeout."
        onClick={() => void settle()}
      />
      <p className="small muted">
        The successful caller can claim a 0.5 IMD reimbursement if the reserve
        is funded and the window has a fee-bearing market. Reimbursement is not
        guaranteed.
      </p>
      <Action
        r={r}
        id="void"
        label="Void timed-out window"
        primary={false}
        disabled={!canVoid}
        reason="Only unanswered windows past the 48-hour deadline can be voided."
        onClick={() => {
          if (k !== undefined)
            void send("void", { functionName: "voidWindow", args: [k] });
        }}
      />
      <h3>Fund the oracle reserve</h3>
      <Stat label="Available oracle reserve">
        {units(g?.oracleReserve)} IMD
      </Stat>
      <p className="muted">
        This is an irreversible donation earmarked for settlement
        reimbursements.
      </p>
      <Field label="Donate IMD" id="oracle-fund">
        <input
          id="oracle-fund"
          inputMode="decimal"
          value={fund}
          onChange={(e) => setFund(e.target.value)}
        />
      </Field>
      <Action
        r={r}
        id="fund"
        label={
          approval
            ? reset
              ? "Reset IMD allowance"
              : "Approve donation"
            : "Donate to oracle reserve"
        }
        primary={false}
        disabled={
          !ready ||
          !token.data ||
          token.data.balance === undefined ||
          token.data.allowance === undefined ||
          token.isError ||
          Date.now() - token.dataUpdatedAt > 45000
        }
        reason="Waiting for verified token state."
        onClick={() => void fundReserve()}
      />
    </section>
  );
}
