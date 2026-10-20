import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useConnection } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import {
  createWalletClient,
  custom,
  erc20Abi,
  type Abi,
  type Hex,
  type Address,
} from "viem";
import { type Runtime } from "./config";
import { verifyDeployment } from "./data";
import { errorText } from "./model";
import { useWalletControl } from "./Wallet";
export interface TransactionTarget {
  address: Address;
  abi: Abi;
  token: Address;
  symbol: string;
  verify: () => Promise<unknown>;
}
const Context = createContext<{
  busy: boolean;
  message: string;
  error: string;
  hash?: Hex;
  run: (
    fn: string,
    args: readonly unknown[],
    approval?: boolean,
    target?: TransactionTarget,
  ) => Promise<boolean>;
}>({ busy: false, message: "", error: "", run: async () => false });
export const useTransaction = () => useContext(Context);
export function TransactionProvider({
  r,
  children,
}: {
  r: Runtime;
  children: ReactNode;
}) {
  const { address, connector, chainId } = useConnection();
  const { open, switchChain } = useWalletControl();
  const cache = useQueryClient();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [hash, setHash] = useState<Hex>();
  async function run(
    fn: string,
    args: readonly unknown[],
    approval = false,
    other?: TransactionTarget,
  ) {
    if (locked.current) return false;
    if (!address || !connector) {
      open();
      return false;
    }
    if (chainId !== r.chain.id) {
      await switchChain();
      return false;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    setHash(undefined);
    setMessage("Checking the transaction…");
    try {
      await verifyDeployment(r);
      if (other) await other.verify();
      const provider = await connector.getProvider();
      const wallet = createWalletClient({
        account: address,
        chain: r.chain,
        transport: custom(provider as any),
      });
      const target: Address = approval
        ? (other?.token ?? r.token.address)
        : (other?.address ?? r.game.address);
      const simulation = await r.client.simulateContract({
        address: target,
        abi: approval ? erc20Abi : (other?.abi ?? r.game.abi),
        functionName: fn,
        args,
        account: address,
      } as any);
      setMessage("Confirm in your wallet…");
      const tx = await wallet.writeContract(simulation.request as any);
      setHash(tx);
      setMessage("Waiting for Ethereum confirmation…");
      const receipt = await r.client.waitForTransactionReceipt({
        hash: tx,
        confirmations: 1,
        timeout: 180000,
      });
      if (receipt.status !== "success")
        throw Error("The transaction reverted. You can try again.");
      setMessage(
        approval
          ? `${other?.symbol ?? "IMD"} approved. Confirm your action next.`
          : fn === "claim"
            ? "Your IMD has been claimed."
            : "Confirmed on Ethereum.",
      );
      await cache.invalidateQueries();
      return true;
    } catch (e) {
      setError(errorText(e));
      setMessage("");
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <Context.Provider value={{ busy, message, error, hash, run }}>
      {children}
    </Context.Provider>
  );
}
export function TransactionStatus({ r }: { r: Runtime }) {
  const t = useTransaction();
  return (
    <div className="transaction-status" role="status">
      {t.error ? (
        <p className="error">{t.error}</p>
      ) : t.message ? (
        <p>
          {t.busy && <span className="spinner" />}
          {t.message}
        </p>
      ) : null}
      {t.hash && (
        <a
          href={`${r.deployment.network.explorer}/tx/${t.hash}`}
          target="_blank"
          rel="noreferrer"
        >
          View transaction ↗
        </a>
      )}
    </div>
  );
}
