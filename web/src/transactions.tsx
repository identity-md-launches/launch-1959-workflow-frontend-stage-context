import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useConnection } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import {
  createWalletClient,
  custom,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import type { Runtime } from "./config";
import { verifyDeployment } from "./data";
import { errorText } from "./model";
type Call = {
  functionName: string;
  args?: readonly unknown[];
  address?: Address;
  abi?: Abi;
  onSubmitted?: (hash: Hex) => void;
};
export type TxState = {
  phase:
    "simulating" | "wallet" | "confirming" | "unknown" | "confirmed" | "error";
  message: string;
  hash?: Hex;
};
const TxContext = createContext<{
  states: Record<string, TxState>;
  busy: boolean;
  send: (id: string, call: Call) => Promise<boolean>;
}>({ states: {}, busy: false, send: async () => false });
export const useTransactions = () => useContext(TxContext);
export function TransactionProvider({
  r,
  children,
}: {
  r: Runtime;
  children: ReactNode;
}) {
  const [states, setStates] = useState<Record<string, TxState>>({});
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [pending, setPending] = useState<{ id: string; hash: Hex } | null>(
    null,
  );
  const [checking, setChecking] = useState(false);
  const { address, chainId, connector } = useConnection();
  const queries = useQueryClient();
  const storageKey = `hamster-hour:pending:${r.deployment.launchId}`;
  function persist(value: { id: string; hash: Hex } | null) {
    try {
      if (value) localStorage.setItem(storageKey, JSON.stringify(value));
      else localStorage.removeItem(storageKey);
    } catch {
      /* confirmation tracking still works without storage */
    }
  }
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (
        value &&
        typeof value.id === "string" &&
        /^0x[\da-f]{64}$/i.test(value.hash)
      ) {
        setPending(value);
        locked.current = true;
        setBusy(true);
        setStates((v) => ({
          ...v,
          [value.id]: {
            phase: "unknown",
            hash: value.hash,
            message:
              "A submitted transaction still needs a confirmation check.",
          },
        }));
      }
    } catch {
      /* invalid local state is not trusted */
    }
  }, [storageKey]);
  async function refresh() {
    await queries.invalidateQueries({
      predicate: (q) => !["stream"].includes(String(q.queryKey[0])),
    });
  }
  async function checkPending() {
    if (!pending || checking) return;
    setChecking(true);
    try {
      await verifyDeployment(r);
      const receipt = await r.client.getTransactionReceipt({
        hash: pending.hash,
      });
      if (receipt.status === "success") {
        await refresh();
        setStates((v) => ({
          ...v,
          [pending.id]: {
            phase: "confirmed",
            hash: pending.hash,
            message: "Confirmed on Ethereum.",
          },
        }));
      } else
        setStates((v) => ({
          ...v,
          [pending.id]: {
            phase: "error",
            hash: pending.hash,
            message: "The transaction reverted. No action was completed.",
          },
        }));
      setPending(null);
      persist(null);
      locked.current = false;
      setBusy(false);
    } catch {
      setStates((v) => ({
        ...v,
        [pending.id]: {
          phase: "unknown",
          hash: pending.hash,
          message:
            "Confirmation is still unavailable. Check the transaction on the explorer before retrying.",
        },
      }));
    } finally {
      setChecking(false);
    }
  }
  async function send(id: string, call: Call) {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    const state = (s: TxState) => setStates((v) => ({ ...v, [id]: s }));
    let hash: Hex | undefined;
    let finalized = false;
    let cancelled = false;
    state({ phase: "simulating", message: "Checking this action on chain…" });
    try {
      if (!connector || !address)
        throw Error("Connect your wallet to continue.");
      const provider = await connector.getProvider();
      const wallet = createWalletClient({
        account: address,
        chain: r.chain,
        transport: custom(provider as any),
      });
      if (chainId !== r.chain.id || (await wallet.getChainId()) !== r.chain.id)
        throw Error(`Switch your wallet to ${r.chain.name} first.`);
      if (
        (await wallet.getAddresses())[0]?.toLowerCase() !==
        address.toLowerCase()
      )
        throw Error(
          "Your wallet account changed. Reconnect before trying again.",
        );
      await verifyDeployment(r);
      const request = {
        address: call.address ?? r.game.address,
        abi: call.abi ?? r.game.abi,
        functionName: call.functionName,
        args: call.args ?? [],
        account: address,
      };
      const simulation = await r.client.simulateContract(request);
      const gas = await r.client.estimateContractGas(request);
      // Recheck identity after RPC preflight, immediately before requesting a signature.
      if (
        (await wallet.getChainId()) !== r.chain.id ||
        (await wallet.getAddresses())[0]?.toLowerCase() !==
          address.toLowerCase()
      )
        throw Error(
          "Your wallet account or network changed. Review the action again.",
        );
      state({
        phase: "wallet",
        message: "Review the action and network fee in your wallet.",
      });
      hash = await wallet.writeContract({
        ...simulation.request,
        chain: r.chain,
        gas: (gas * 120n) / 100n,
      });
      persist({ id, hash });
      call.onSubmitted?.(hash);
      state({
        phase: "confirming",
        message: "Submitted. Waiting for on-chain confirmation…",
        hash,
      });
      const receipt = await r.client.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 180000,
        onReplaced: (replacement) => {
          hash = replacement.transaction.hash;
          cancelled = replacement.reason === "cancelled";
          persist({ id, hash });
          call.onSubmitted?.(hash);
          state({
            phase: "confirming",
            message: "Following the replacement transaction…",
            hash,
          });
        },
      });
      finalized = true;
      persist(null);
      if (cancelled)
        throw Error("The transaction was cancelled in your wallet.");
      if (receipt.status !== "success")
        throw Error("The transaction reverted. No action was completed.");
      await refresh();
      state({
        phase: "confirmed",
        message: "Confirmed on Ethereum.",
        hash,
      });
      return true;
    } catch (e) {
      if (hash && !finalized) {
        setPending({ id, hash });
        state({
          phase: "unknown",
          hash,
          message:
            "Confirmation is unavailable. Check the submitted transaction before sending another.",
        });
      } else state({ phase: "error", message: errorText(e), hash });
      return false;
    } finally {
      if (!hash || finalized) {
        locked.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <TxContext.Provider value={{ states, busy, send }}>
      {pending && (
        <div className="pending-transaction" role="status">
          <span>
            A submitted transaction needs confirmation. New actions are locked
            to prevent duplicates.
          </span>
          <a
            href={`${r.deployment.network.explorer}/tx/${pending.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction ↗
          </a>
          <button onClick={() => void checkPending()} disabled={checking}>
            {checking ? "Checking receipt…" : "Check confirmation"}
          </button>
        </div>
      )}
      {children}
    </TxContext.Provider>
  );
}
export function TxFeedback({ id, r }: { id: string; r: Runtime }) {
  const { states } = useTransactions();
  const state = states[id];
  return (
    <div
      className={`tx-feedback ${state?.phase === "error" ? "error" : ""}`}
      role="status"
    >
      {state && (
        <>
          <span>{state.message}</span>
          {state.hash && (
            <a
              href={`${r.deployment.network.explorer}/tx/${state.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction ↗
            </a>
          )}
        </>
      )}
    </div>
  );
}
export function txLabel(state: TxState | undefined, label: string) {
  return state &&
    ["simulating", "wallet", "confirming", "unknown"].includes(state.phase)
    ? state.phase === "simulating"
      ? "Checking…"
      : state.phase === "wallet"
        ? "Confirm in wallet…"
        : state.phase === "unknown"
          ? "Check pending transaction"
          : "Confirming…"
    : label;
}
