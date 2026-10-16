import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import {
  decodeAbiParameters,
  parseAbiItem,
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  stringToHex,
  zeroAddress,
  type Hex,
} from "viem";
import { reader, same } from "./data";
import { uint, dateTime, errorText } from "./model";
import { Action, AddressLink, ErrorNote, Field } from "./ui";
import { useTransactions } from "./transactions";
import { scanLogs, firstBlock } from "./portfolio";
import type { PageProps } from "./Bet";
const settings = [
  {
    key: "stakingToken",
    name: "Staking token",
    method: "StakingToken",
    type: "address",
  },
  {
    key: "jackpotToken",
    name: "Jackpot token",
    method: "JackpotToken",
    type: "address",
  },
  { key: "sourceUrl", name: "Source URL", method: "SourceUrl", type: "string" },
  {
    key: "genesisTimestamp",
    name: "Genesis timestamp",
    method: "GenesisTimestamp",
    type: "uint64",
  },
] as const;
export function Settings(props: PageProps) {
  return (
    <section className="section settings">
      <h3>Public settings &amp; TEAM controls</h3>
      <p>
        TEAM can change only these four settings, each with 48 hours of public
        notice. Token choices are permanent once executed.
      </p>
      {settings.map((s) => (
        <Setting key={s.key} {...props} setting={s} />
      ))}
      {props.g && (
        <AddressLink r={props.r} value={props.g.TEAM} label="TEAM address" />
      )}
    </section>
  );
}
function Setting({
  r,
  g,
  ready,
  now,
  setting: s,
}: PageProps & { setting: (typeof settings)[number] }) {
  const { address } = useConnection();
  const { send } = useTransactions();
  const [value, setValue] = useState(""),
    [error, setError] = useState("");
  const key = keccak256(stringToHex(s.key));
  const q = useQuery({
    queryKey: ["setting", key],
    queryFn: () => reader(r)<readonly [Hex, bigint]>("pendingConfig", [key]),
    refetchInterval: 15000,
    retry: 1,
  });
  const pendingValue = useQuery({
    queryKey: ["pending-value", key, q.data?.[0]],
    enabled: !!q.data && q.data[1] > 0n,
    queryFn: async ({ signal }) => {
      const logs = await scanLogs(
        r,
        parseAbiItem(
          "event ConfigScheduled(bytes32 indexed setting, bytes value, uint64 readyAt)",
        ),
        { setting: key },
        firstBlock,
        await r.client.getBlockNumber(),
        signal,
      );
      const latest = [...logs]
        .reverse()
        .find(
          (log: any) =>
            log.args?.value && keccak256(log.args.value) === q.data![0],
        );
      if (!latest)
        throw Error(
          "The scheduled value could not be read from public events.",
        );
      return String(
        decodeAbiParameters([{ type: s.type }], (latest as any).args.value)[0],
      );
    },
    retry: 1,
  });
  const team = !!address && !!g && same(address, g.TEAM);
  const current = g?.[s.key];
  const already =
    s.type === "address" && current !== undefined && current !== zeroAddress;
  function parsed() {
    if (s.type === "address") {
      const v = value.trim();
      if (!isAddress(v) || same(v, zeroAddress) || same(v, r.game.address))
        throw Error("Enter a valid, nonzero token contract address.");
      return getAddress(v);
    }
    if (s.type === "uint64") {
      const v = uint(value, 64);
      if (v === 0n || v > 2n ** 64n - 1n - 176400n)
        throw Error("Enter a valid nonzero Unix timestamp in seconds.");
      return v;
    }
    const v = value.trim();
    if (
      !/^https:\/\/[^\s"\\]+$/.test(v) ||
      v.length < 9 ||
      v.length > 256 ||
      /[^\x21-\x7e]/.test(v)
    )
      throw Error(
        "Use an HTTPS URL of 9–256 printable ASCII characters without spaces, quotes or backslashes.",
      );
    return v;
  }
  let matches = false;
  try {
    const v = parsed();
    const encoded = encodeAbiParameters([{ type: s.type }], [v] as any);
    matches = !!q.data && q.data[0] === keccak256(encoded);
  } catch {
    /* show on submit */
  }
  const fresh = !q.isError && Date.now() - q.dataUpdatedAt < 45000;
  const canExecute =
    !!q.data &&
    q.data[1] > 0n &&
    BigInt(Math.floor(now / 1000)) >= q.data[1] &&
    matches;
  async function change(execute: boolean) {
    try {
      setError("");
      if (!team || !ready || !fresh || already)
        throw Error("This setting is unavailable.");
      const v = parsed();
      if (execute && !canExecute)
        throw Error("Use the scheduled value after its timelock ends.");
      await send(`${s.key}-${execute ? "execute" : "schedule"}`, {
        functionName: `${execute ? "set" : "schedule"}${s.method}`,
        args: [v],
      });
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <section className="setting">
      <h3>{s.name}</h3>
      <dl className="key-values">
        <div>
          <dt>Current</dt>
          <dd className="break">
            {current === undefined ? (
              "Loading…"
            ) : s.type === "address" ? (
              current === zeroAddress ? (
                "Not configured"
              ) : (
                <AddressLink r={r} value={current as `0x${string}`} />
              )
            ) : (
              current.toString()
            )}
          </dd>
        </div>
        <div>
          <dt>Pending</dt>
          <dd>
            {q.isError
              ? "Read unavailable"
              : q.isPending
                ? "Loading…"
                : q.data[1] === 0n
                  ? "No scheduled change"
                  : `Executable from ${dateTime(q.data[1])}`}
          </dd>
        </div>
        {q.data && q.data[1] > 0n && (
          <div>
            <dt>Scheduled value</dt>
            <dd className="break">
              {pendingValue.isError
                ? "Could not read the value; inspect public events below."
                : (pendingValue.data ?? "Reading scheduled value…")}
            </dd>
          </div>
        )}
        {q.data && q.data[1] > 0n && (
          <div>
            <dt>Value hash</dt>
            <dd className="break">{q.data[0]}</dd>
          </div>
        )}
      </dl>
      {q.data && q.data[1] > 0n && (
        <a
          href={`${r.deployment.network.explorer}/address/${r.game.address}#events`}
          target="_blank"
          rel="noreferrer"
        >
          Inspect the public scheduled value ↗
        </a>
      )}
      {team && !already && (
        <div className="team-form">
          <Field
            label={
              s.type === "address"
                ? `New ${s.name.toLowerCase()} address`
                : s.type === "uint64"
                  ? "New genesis · Unix seconds"
                  : "New source URL"
            }
            id={`setting-${s.key}`}
            hint={
              s.type === "address"
                ? "Use the token’s official deployment record. This choice is irreversible."
                : s.type === "uint64"
                  ? "Changing genesis can close betting early and alter future windows."
                  : "New windows will freeze this source in their oracle question."
            }
          >
            <input
              id={`setting-${s.key}`}
              value={value}
              inputMode={s.type === "uint64" ? "numeric" : "text"}
              spellCheck={false}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
          <ErrorNote message={error} />
          <div className="setting-actions">
            <Action
              r={r}
              id={`${s.key}-schedule`}
              label="Schedule 48-hour change"
              primary={false}
              disabled={!ready || !fresh}
              onClick={() => void change(false)}
            />
            <Action
              r={r}
              id={`${s.key}-execute`}
              label="Execute scheduled change"
              primary={false}
              disabled={!ready || !fresh || !canExecute}
              reason="The value must match the proposal and its delay must have ended."
              onClick={() => void change(true)}
            />
          </div>
        </div>
      )}
      {team && already && (
        <p className="small muted">The one-shot token setting is complete.</p>
      )}
    </section>
  );
}
