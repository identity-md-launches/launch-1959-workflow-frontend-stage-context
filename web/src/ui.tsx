import { useState, type ReactNode } from "react";
import { useConnection } from "wagmi";
import { getAddress, type Address } from "viem";
import { useWalletControl } from "./Wallet";
import { useTransactions, txLabel, TxFeedback } from "./transactions";
import { shortAddress } from "./model";
import type { Runtime } from "./config";
export function Action({
  r,
  id,
  label,
  onClick,
  disabled = false,
  reason,
  primary = true,
}: {
  r: Runtime;
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  reason?: string;
  primary?: boolean;
}) {
  const { address, chainId } = useConnection();
  const { open, switchChain, switching } = useWalletControl();
  const { states, busy } = useTransactions();
  const connected = !!address && chainId === r.chain.id;
  return (
    <div className="action">
      <button
        className={primary ? "primary" : "secondary"}
        disabled={switching || busy || (connected && disabled)}
        onClick={
          !address
            ? open
            : chainId !== r.chain.id
              ? () => void switchChain()
              : onClick
        }
      >
        {!address
          ? "Connect to continue"
          : chainId !== r.chain.id
            ? `Switch to ${r.chain.name}`
            : txLabel(states[id], label)}
      </button>
      {connected && disabled && reason && (
        <p className="small muted">{reason}</p>
      )}
      <TxFeedback id={id} r={r} />
    </div>
  );
}
export function AddressLink({
  value,
  r,
  label,
}: {
  value: Address;
  r: Runtime;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const checksum = getAddress(value);
  return (
    <div className="address-line">
      <a
        title={checksum}
        href={`${r.deployment.network.explorer}/address/${value}`}
        target="_blank"
        rel="noreferrer"
      >
        {label ?? shortAddress(checksum)} ↗
      </a>
      <button
        aria-label={`Copy ${label ?? "address"}`}
        title={checksum}
        className="copy"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(checksum);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
export function Stat({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}
export function Field({
  label,
  id,
  children,
  hint,
  error,
}: {
  label: string;
  id: string;
  children: ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && (
        <p className="small muted" id={id + "-hint"}>
          {hint}
        </p>
      )}
      {error && (
        <p className="error small" id={id + "-error"} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function ErrorNote({ message, id }: { message?: string; id?: string }) {
  return (
    <p id={id} className="error small" role="status">
      {message ?? ""}
    </p>
  );
}
