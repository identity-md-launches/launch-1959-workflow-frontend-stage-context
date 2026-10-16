import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useConnect, useConnectors, useConnection, useDisconnect } from "wagmi";
import { getAddress } from "viem";
import type { Runtime } from "./config";
import { errorText, shortAddress } from "./model";
const OPEN_IN = [
  {
    id: "metamask",
    name: "MetaMask",
    href: (u: string) =>
      `https://link.metamask.io/dapp/${u.replace(/^https?:\/\//, "")}`,
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    href: (u: string) =>
      `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(u)}`,
  },
  {
    id: "rabby",
    name: "Rabby",
    href: (u: string) =>
      `https://go.rabby.io/mobile/?_cmd=open-dapp&dapp=${encodeURIComponent(u)}`,
  },
  {
    id: "phantom",
    name: "Phantom",
    href: (u: string) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(new URL(u).origin)}`,
  },
];
const WalletContext = createContext<{
  open: () => void;
  switchChain: () => Promise<void>;
  switching: boolean;
  connecting: boolean;
}>({
  open: () => {},
  switchChain: async () => {},
  switching: false,
  connecting: false,
});
export const useWalletControl = () => useContext(WalletContext);
export function WalletProvider({
  r,
  children,
}: {
  r: Runtime;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [pending, setPending] = useState(""),
    [switching, setSwitching] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const connectors = useConnectors();
  const connect = useConnect();
  const { connector, isConnected } = useConnection();
  const named = connectors.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !(window as any).ethereum &&
    !named;
  const listed = [
    ...connectors.filter((c) => c.type === "injected"),
    ...connectors.filter((c) => c.type !== "injected"),
  ].filter(
    (c) =>
      !(c.id === "injected" && named) && (!mobile || c.type !== "injected"),
  );
  function show() {
    trigger.current = document.activeElement as HTMLElement;
    setError("");
    // One detected wallet: connect in one tap instead of showing a one-row picker.
    const detected = listed.filter(
      (c) => c.type === "injected" && c.id !== "injected",
    );
    const only = detected.length === 1 && !mobile ? detected[0] : undefined;
    if (only) {
      setPending(only.uid);
      connect
        .mutateAsync({ connector: only })
        .catch((e) => setError(errorText(e)))
        .finally(() => setPending(""));
      return;
    }
    setOpen(true);
  }
  function close() {
    setOpen(false);
    queueMicrotask(() => trigger.current?.focus());
  }
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    if (isConnected) close();
  }, [isConnected]);
  async function switchChain() {
    if (!connector) return;
    setSwitching(true);
    setError("");
    try {
      const provider = (await connector.getProvider()) as {
        request: (args: {
          method: string;
          params?: unknown[];
        }) => Promise<unknown>;
      };
      const params = [{ chainId: `0x${r.chain.id.toString(16)}` }];
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params,
        });
      } catch (e: any) {
        if (
          e.code !== 4902 &&
          e.cause?.code !== 4902 &&
          !/unknown chain|unrecognized chain|not (?:been )?added/i.test(
            e.message ?? "",
          )
        )
          throw e;
        if (!r.deployment.walletAddChain)
          throw Error(
            "This network cannot be added automatically. Add it in your wallet.",
          );
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [r.deployment.walletAddChain],
        });
        await provider.request({
          method: "wallet_switchEthereumChain",
          params,
        });
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSwitching(false);
    }
  }
  return (
    <WalletContext.Provider
      value={{
        open: show,
        switchChain,
        switching,
        connecting: !!pending && !open,
      }}
    >
      {children}
      {error && !open && (
        <div className="wallet-error" role="alert">
          {error}
          <button
            onClick={() => setError("")}
            aria-label="Dismiss wallet error"
          >
            ×
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        className="wallet-sheet"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
        aria-labelledby="wallet-title"
      >
        <div className="sheet-head">
          <h2 id="wallet-title">Connect a wallet</h2>
          <button onClick={close} aria-label="Close wallet picker">
            ×
          </button>
        </div>
        <p className="muted">Your wallet stays in control.</p>
        {mobile &&
          OPEN_IN.map((w) => (
            <a className="wallet-row" href={w.href(location.href)} key={w.id}>
              <img
                src={`./wallets/${w.id}.svg`}
                width="28"
                height="28"
                alt=""
              />
              Open in {w.name}
              <span aria-hidden="true">↗</span>
            </a>
          ))}
        {listed.map((c) => (
          <button
            className="wallet-row"
            key={c.uid}
            disabled={!!pending}
            onClick={async () => {
              setPending(c.uid);
              setError("");
              try {
                await connect.mutateAsync({ connector: c });
              } catch (e) {
                setError(errorText(e));
              } finally {
                setPending("");
              }
            }}
          >
            <img
              src={
                c.icon ??
                (c.id === "coinbaseWalletSDK"
                  ? "./wallets/coinbase.svg"
                  : "./wallets/browser.svg")
              }
              alt=""
              width="28"
              height="28"
            />
            {c.id === "injected"
              ? "Browser wallet"
              : c.id === "coinbaseWalletSDK"
                ? mobile
                  ? "Coinbase Smart Wallet"
                  : "Coinbase Wallet"
                : c.name}
            {pending === c.uid ? " · opening…" : ""}
          </button>
        ))}
        {!named && !mobile && (
          <p className="small muted">
            Install a browser wallet or create a Coinbase passkey wallet.
          </p>
        )}
        <p role="status" className="error">
          {error}
        </p>
      </dialog>
    </WalletContext.Provider>
  );
}
export function WalletControl({ r }: { r: Runtime }) {
  const [copyLabel, setCopyLabel] = useState("Copy address");
  const { address, isConnected, chainId } = useConnection();
  const { disconnect } = useDisconnect();
  const { open, switchChain, switching, connecting } = useWalletControl();
  if (isConnected && chainId !== r.chain.id)
    return (
      <button
        className="wallet-button"
        onClick={switchChain}
        disabled={switching}
      >
        {switching ? "Switching…" : `Switch to ${r.chain.name}`}
      </button>
    );
  if (address)
    return (
      <details className="account-menu">
        <summary>
          {shortAddress(getAddress(address))}
          <span aria-hidden="true">⌄</span>
        </summary>
        <div className="account-popover">
          <p className="break">{getAddress(address)}</p>
          <a
            href={`${r.deployment.network.explorer}/address/${address}`}
            target="_blank"
            rel="noreferrer"
          >
            View on explorer ↗
          </a>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(getAddress(address));
                setCopyLabel("Address copied");
              } catch {
                setCopyLabel("Copy unavailable");
              }
            }}
          >
            {copyLabel}
          </button>
          <button onClick={() => disconnect()}>Disconnect</button>
        </div>
      </details>
    );
  return (
    <button className="wallet-button" onClick={open} disabled={connecting}>
      {connecting ? "Connecting…" : "Connect wallet"}{" "}
      <span aria-hidden="true">↗</span>
    </button>
  );
}
