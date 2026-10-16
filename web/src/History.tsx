import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { services } from "./config";
import { reader, useWindow } from "./data";
import {
  uint,
  units,
  dateTime,
  uuidFromBytes32,
  errorText,
  type GameWindow,
} from "./model";
import { Action, ErrorNote, Field } from "./ui";
import { useTransactions } from "./transactions";
import { Keeper } from "./Keeper";
import type { PageProps } from "./Bet";
function OracleLink({ requestId }: { requestId: string }) {
  let uuid = "";
  try {
    uuid = uuidFromBytes32(requestId);
  } catch {
    /* invalid id stays unavailable */
  }
  const q = useQuery({
    queryKey: ["oracle-link", uuid],
    enabled: !!uuid,
    staleTime: 300000,
    retry: false,
    queryFn: async () => {
      const response = await fetch(
        `${services.oracleAPI}/oracle/requests/${uuid}`,
        { signal: AbortSignal.timeout(10000) },
      );
      if (!response.ok) throw Error("Oracle record unavailable.");
      const record = await response.json();
      const job = record.jobId ?? record.request?.jobId;
      if (
        typeof job !== "string" ||
        !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(job)
      )
        throw Error("Oracle evidence job is unavailable.");
      return job;
    },
  });
  return (
    <div className="oracle-links">
      {q.data ? (
        <a
          href={`${services.oracleExplorer}/jobs/${q.data}`}
          target="_blank"
          rel="noreferrer"
        >
          Oracle evidence ↗
        </a>
      ) : (
        <span className="small muted">
          {q.isPending ? "Loading evidence…" : "Evidence link unavailable"}
        </span>
      )}
      {uuid && (
        <a
          href={`${services.oracleAPI}/oracle/requests/${uuid}/attestation`}
          target="_blank"
          rel="noreferrer"
        >
          Signed attestation ↗
        </a>
      )}
    </div>
  );
}
export function History({ r, g, ready, now }: PageProps) {
  const [page, setPage] = useState(0),
    [lookup, setLookup] = useState(""),
    [selected, setSelected] = useState<bigint>(),
    [error, setError] = useState("");
  const { address } = useConnection();
  const { send } = useTransactions();
  const current = g?.currentWindow;
  const q = useQuery({
    queryKey: ["history", current?.toString(), page],
    enabled: current !== undefined,
    queryFn: async () => {
      const top = current! - BigInt(page * 12);
      const ids = Array.from(
        { length: top >= 11n ? 12 : Number(top + 1n > 0n ? top + 1n : 0n) },
        (_, i) => top - BigInt(i),
      );
      const block = await r.client.getBlockNumber();
      return Promise.all(
        ids.map(async (k) => ({
          k,
          window: await reader(r)<GameWindow>("window", [k], block),
        })),
      );
    },
    refetchInterval: 30000,
    retry: 1,
  });
  const details = useWindow(r, selected, address);
  const shown = q.data?.filter((row) => row.window.status !== 0);
  return (
    <section className="section">
      <div className="section-title">
        <h2>Window history</h2>
        <span className="small muted">
          {g?.settledWindows.toString() ?? "…"} settled
        </span>
      </div>
      <p className="muted">
        Results are accepted only from signed IMD oracle attestations.
      </p>
      <div className="input-row">
        <Field label="Find a window" id="history-window">
          <input
            id="history-window"
            inputMode="numeric"
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
          />
        </Field>
        <button
          onClick={() => {
            try {
              setSelected(uint(lookup, 64));
              setError("");
            } catch (e) {
              setError(errorText(e));
            }
          }}
        >
          Find window
        </button>
      </div>
      <ErrorNote message={error} />
      {q.isPending ? (
        <p role="status">Reading recent windows…</p>
      ) : q.isError ? (
        <div className="notice error">
          History could not load.{" "}
          <button onClick={() => void q.refetch()}>Retry history</button>
        </div>
      ) : !shown?.length ? (
        <div className="empty-state">
          <h3>No funded windows in this range</h3>
          <p>
            Empty windows are never settled. Browse earlier windows or look up a
            number.
          </p>
        </div>
      ) : (
        <div className="history-list">
          {shown.map(({ k, window: w }) => (
            <article className="history-row" key={k.toString()}>
              <div>
                <h3>Window {k.toString()}</h3>
                <span className="small muted">
                  Rounds {(k * 6n).toString()}–{(k * 6n + 5n).toString()}
                </span>
              </div>
              <div>
                <strong>
                  {w.status === 2
                    ? `${w.result} passes`
                    : w.status === 3
                      ? "Voided"
                      : BigInt(Math.floor(now / 1000)) < w.endsAt
                        ? "In progress"
                        : "Awaiting oracle"}
                </strong>
                <span className="small muted">
                  {units(w.pools.reduce((a, b) => a + b, 0n))} IMD pooled
                </span>
              </div>
              {w.status === 2 && <OracleLink requestId={w.requestId} />}
              <button onClick={() => setSelected(k)}>View window</button>
            </article>
          ))}
        </div>
      )}
      <div className="pagination">
        <button
          disabled={page === 0 || q.isFetching}
          onClick={() => setPage((p) => p - 1)}
        >
          Newer
        </button>
        <span className="small muted">
          Windows{" "}
          {current === undefined
            ? "…"
            : `${current - BigInt(page * 12) > 11n ? current - BigInt(page * 12) - 11n : 0n}–${current - BigInt(page * 12)}`}
        </span>
        <button
          disabled={
            current === undefined ||
            current < BigInt((page + 1) * 12) ||
            q.isFetching
          }
          onClick={() => setPage((p) => p + 1)}
        >
          Earlier
        </button>
      </div>
      {selected !== undefined && (
        <section className="section window-detail">
          <h3>Window {selected.toString()} details</h3>
          {details.isPending ? (
            <p>Loading window…</p>
          ) : details.isError ? (
            <p className="error">This window could not be read.</p>
          ) : (
            details.data && (
              <>
                <dl className="key-values">
                  <div>
                    <dt>Status</dt>
                    <dd>
                      {
                        ["Uncreated", "Pending", "Settled", "Voided"][
                          details.data.window.status
                        ]
                      }
                    </dd>
                  </div>
                  <div>
                    <dt>Line</dt>
                    <dd>
                      {details.data.window.status
                        ? details.data.window.line.toString()
                        : "Not frozen yet"}
                    </dd>
                  </div>
                  <div>
                    <dt>Start / end</dt>
                    <dd>
                      {dateTime(details.data.times[0])} /{" "}
                      {dateTime(details.data.times[1])}
                    </dd>
                  </div>
                  <div>
                    <dt>Result source</dt>
                    <dd className="break">
                      {details.data.window.source || "Not frozen yet"}
                    </dd>
                  </div>
                  <div>
                    <dt>Market refunds</dt>
                    <dd>
                      {details.data.window.marketVoided
                        .map((v, i) =>
                          v ? ["Over / under", "Exact", "Sleep"][i] : "",
                        )
                        .filter(Boolean)
                        .join(", ") || "None recorded"}
                    </dd>
                  </div>
                </dl>
                {details.data.window.status === 2 && (
                  <OracleLink requestId={details.data.window.requestId} />
                )}
                <Action
                  r={r}
                  id="history-claim"
                  label="Claim this window"
                  primary={false}
                  disabled={
                    !ready ||
                    details.isError ||
                    Date.now() - details.dataUpdatedAt > 45000 ||
                    !(
                      details.data.window.status >= 2 ||
                      (details.data.window.status === 1 &&
                        !!g &&
                        BigInt(Math.floor(now / 1000)) >=
                          details.data.times[1] + g.TIMEOUT)
                    )
                  }
                  reason="The window must settle or reach its refund deadline."
                  onClick={() =>
                    void send("history-claim", {
                      functionName: "claim",
                      args: [selected, true],
                    })
                  }
                />
              </>
            )
          )}
        </section>
      )}
      <Keeper r={r} g={g} ready={ready} now={now} initialWindow={selected} />
    </section>
  );
}
