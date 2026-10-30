import {
  decodeEventLog,
  getEventSelector,
  isAddress,
  toHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";

// This module has no React, wallet, price API, or backend dependency. Another
// event-based board can supply its own ABI, deployment, and event-to-bet decoder.
export interface VolumeBet {
  bettor: Address;
  hour: bigint;
  amount: bigint;
  ticket: boolean;
}
export interface WalletVolume {
  address: Address;
  volume: bigint;
  bets: number;
  tickets: number;
  hours: Set<string>;
}
export interface RankedWallet extends WalletVolume {
  rank: number;
}
export function aggregateBets(
  bets: readonly VolumeBet[],
  previous = new Map<string, WalletVolume>(),
) {
  const wallets = new Map(
    [...previous].map(([a, w]) => [a, { ...w, hours: new Set(w.hours) }]),
  );
  for (const bet of bets) {
    if (bet.amount < 0n || bet.hour < 0n || !isAddress(bet.bettor))
      throw Error("Invalid bet event");
    const address = bet.bettor.toLowerCase() as Address;
    const w = wallets.get(address) ?? {
      address,
      volume: 0n,
      bets: 0,
      tickets: 0,
      hours: new Set<string>(),
    };
    w.volume += bet.amount;
    w.bets++;
    if (bet.ticket) w.tickets++;
    w.hours.add(String(bet.hour));
    wallets.set(address, w);
  }
  return wallets;
}
export function rankWallets(
  wallets: ReadonlyMap<string, WalletVolume>,
): RankedWallet[] {
  return [...wallets.values()]
    .sort((a, b) =>
      a.volume === b.volume
        ? a.address.localeCompare(b.address)
        : a.volume > b.volume
          ? -1
          : 1,
    )
    .map((w, i) => ({ ...w, rank: i + 1 }));
}
export function volumeImd(amount: bigint) {
  const cents = (amount + 5_000_000_000_000_000n) / 10_000_000_000_000_000n;
  return `${new Intl.NumberFormat("en-US").format(cents / 100n)}.${String(cents % 100n).padStart(2, "0")}`;
}

export type RpcCall = <T>(
  method: string,
  params: unknown[],
  signal: AbortSignal,
  valid?: (value: unknown) => boolean,
) => Promise<T>;
const hexQuantity = (v: unknown): v is Hex =>
  typeof v === "string" && /^0x[0-9a-f]+$/i.test(v);
const blockHash = (v: unknown): v is Hex =>
  typeof v === "string" && /^0x[0-9a-f]{64}$/i.test(v);
const abort = (signal: AbortSignal) => signal.throwIfAborted();
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    abort(signal);
    const stop = () => {
      clearTimeout(id);
      reject(signal.reason);
    };
    const id = setTimeout(() => {
      signal.removeEventListener("abort", stop);
      resolve();
    }, ms);
    signal.addEventListener("abort", stop, { once: true });
  });
}
export function createRpcPool(
  urls: readonly string[],
  options: {
    fetch?: typeof fetch;
    timeoutMs?: number;
    retryDelayMs?: number;
    onRetry?: () => void;
  } = {},
): RpcCall {
  let preferred = 0,
    id = 0;
  return async <T>(
    method: string,
    params: unknown[],
    signal: AbortSignal,
    valid?: (value: unknown) => boolean,
  ): Promise<T> => {
    const errors: string[] = [];
    for (let round = 0; round < 2; round++) {
      for (let offset = 0; offset < urls.length; offset++) {
        abort(signal);
        const index = (preferred + offset) % urls.length;
        try {
          const requestId = ++id;
          const response = await (options.fetch ?? fetch)(urls[index], {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: requestId,
              method,
              params,
            }),
            signal: AbortSignal.any([
              signal,
              AbortSignal.timeout(options.timeoutMs ?? 8_000),
            ]),
          });
          const data = await response.json().catch(() => null);
          if (!response.ok)
            throw Error(data?.error?.message ?? `RPC HTTP ${response.status}`);
          if (
            !data ||
            data.error ||
            data.id !== requestId ||
            !("result" in data) ||
            (valid && !valid(data.result))
          )
            throw Error(data?.error?.message ?? "Invalid RPC response");
          preferred = index;
          return data.result as T;
        } catch (e) {
          abort(signal);
          errors.push(e instanceof Error ? e.message : String(e));
          options.onRetry?.();
        }
      }
      if (round === 0) await delay(options.retryDelayMs ?? 500, signal);
    }
    throw Error(errors.join("; ") || "No Ethereum RPC available");
  };
}
export interface RawVolumeLog {
  address: Address;
  topics: readonly Hex[];
  data: Hex;
  blockNumber: Hex;
  blockHash: Hex;
  transactionHash: Hex;
  logIndex: Hex;
  removed?: boolean;
}
export function decodeVolumeBet(
  abi: Abi,
  log: RawVolumeLog,
  ticketPrice: bigint,
): VolumeBet {
  const { eventName, args } = decodeEventLog({
    abi,
    data: log.data,
    topics: log.topics as [Hex, ...Hex[]],
    strict: true,
  });
  const a = args as unknown as { k: bigint; bettor: Address; amount?: bigint };
  if (eventName !== "BinaryBet" && eventName !== "TicketBought")
    throw Error("Unexpected event");
  if (
    typeof a.k !== "bigint" ||
    !isAddress(a.bettor) ||
    (eventName === "BinaryBet" && typeof a.amount !== "bigint")
  )
    throw Error("Invalid bet arguments");
  return {
    bettor: a.bettor,
    hour: a.k,
    ticket: eventName === "TicketBought",
    amount: eventName === "TicketBought" ? ticketPrice : a.amount!,
  };
}
interface Checkpoint {
  lastBlock: bigint;
  lastHash?: Hex;
  complete: boolean;
  wallets: Map<string, WalletVolume>;
}
export interface ScanProgress {
  scanned: bigint;
  total: bigint;
  lastBlock: bigint;
  target: bigint;
}
export interface VolumeSnapshot {
  rows: RankedWallet[];
  lastBlock: bigint;
  cached: boolean;
}
export interface VolumeScannerOptions {
  chainId: number;
  address: Address;
  deploymentBlock: bigint;
  abi: Abi;
  decode: (log: RawVolumeLog) => VolumeBet;
  rpc: RpcCall;
  storage?: Pick<Storage, "getItem" | "setItem">;
  // Include the aggregation rule version so a price/rule change invalidates cache.
  cacheVersion: string;
}
export class VolumeScanner {
  readonly key: string;
  private checkpoint: Checkpoint;
  cacheAvailable = true;
  constructor(private options: VolumeScannerOptions) {
    this.key = `hh-volume:${options.cacheVersion}:${options.chainId}:${options.address.toLowerCase()}:${options.deploymentBlock}`;
    this.checkpoint = this.empty();
    try {
      const raw = options.storage?.getItem(this.key);
      if (raw) this.checkpoint = this.parse(raw);
      if (!options.storage) this.cacheAvailable = false;
    } catch {
      /* A corrupt/blocked cache always starts a real scan. */
    }
  }
  private empty(): Checkpoint {
    return {
      lastBlock: this.options.deploymentBlock - 1n,
      complete: false,
      wallets: new Map(),
    };
  }
  private parse(raw: string): Checkpoint {
    const data = JSON.parse(raw);
    if (
      !/^\d+$/.test(data.lastBlock) ||
      BigInt(data.lastBlock) < this.options.deploymentBlock ||
      !blockHash(data.lastHash) ||
      typeof data.complete !== "boolean" ||
      !Array.isArray(data.wallets)
    )
      throw Error("Invalid checkpoint");
    const wallets = new Map<string, WalletVolume>();
    for (const w of data.wallets) {
      if (
        !isAddress(w.address) ||
        !/^\d+$/.test(w.volume) ||
        !Number.isSafeInteger(w.bets) ||
        w.bets < 1 ||
        !Number.isSafeInteger(w.tickets) ||
        w.tickets < 0 ||
        w.tickets > w.bets ||
        !Array.isArray(w.hours) ||
        !w.hours.length ||
        w.hours.length > w.bets ||
        !w.hours.every((h: unknown) => typeof h === "string" && /^\d+$/.test(h))
      )
        throw Error("Invalid wallet checkpoint");
      const address = w.address.toLowerCase() as Address;
      if (wallets.has(address) || new Set(w.hours).size !== w.hours.length)
        throw Error("Duplicate checkpoint");
      wallets.set(address, {
        address,
        volume: BigInt(w.volume),
        bets: w.bets,
        tickets: w.tickets,
        hours: new Set(w.hours),
      });
    }
    return {
      lastBlock: BigInt(data.lastBlock),
      lastHash: data.lastHash,
      complete: data.complete,
      wallets,
    };
  }
  private save() {
    try {
      if (!this.options.storage) return;
      const c = this.checkpoint;
      this.options.storage.setItem(
        this.key,
        JSON.stringify({
          lastBlock: String(c.lastBlock),
          lastHash: c.lastHash,
          complete: c.complete,
          wallets: [...c.wallets.values()].map((w) => ({
            ...w,
            volume: String(w.volume),
            hours: [...w.hours],
          })),
        }),
      );
    } catch {
      this.cacheAvailable = false;
    }
  }
  snapshot(): VolumeSnapshot | undefined {
    const c = this.checkpoint;
    return c.complete
      ? { rows: rankWallets(c.wallets), lastBlock: c.lastBlock, cached: true }
      : undefined;
  }
  async scan(
    signal: AbortSignal,
    onProgress: (p: ScanProgress) => void = () => {},
    onReset: () => void = () => {},
  ): Promise<VolumeSnapshot> {
    const o = this.options;
    const headHex = await o.rpc<Hex>(
      "eth_blockNumber",
      [],
      signal,
      hexQuantity,
    );
    const target = BigInt(headHex);
    if (target < o.deploymentBlock) throw Error("RPC is behind the deployment");
    const header = (n: bigint) =>
      o.rpc<{ hash: Hex; number: Hex }>(
        "eth_getBlockByNumber",
        [toHex(n), false],
        signal,
        (v) =>
          !!v && blockHash((v as any).hash) && (v as any).number === toHex(n),
      );
    if (this.checkpoint.lastHash) {
      const c = this.checkpoint;
      if (
        c.lastBlock > target ||
        (await header(c.lastBlock)).hash !== c.lastHash
      ) {
        this.checkpoint = this.empty();
        onReset();
      }
    }
    const progress = () =>
      onProgress({
        scanned: this.checkpoint.lastBlock - o.deploymentBlock + 1n,
        total: target - o.deploymentBlock + 1n,
        lastBlock: this.checkpoint.lastBlock,
        target,
      });
    progress();
    const topics = o.abi
      .filter((e) => e.type === "event")
      .map((e) => getEventSelector(e));
    const readRange = async (from: bigint, to: bigint): Promise<void> => {
      const before = await header(to);
      let logs: RawVolumeLog[];
      try {
        logs = await o.rpc<RawVolumeLog[]>(
          "eth_getLogs",
          [
            {
              address: o.address,
              fromBlock: toHex(from),
              toBlock: toHex(to),
              topics: [topics],
            },
          ],
          signal,
          Array.isArray,
        );
      } catch (e) {
        // A provider can impose an even smaller range or response-size cap.
        if (
          to > from &&
          /block.*range|range.*(limit|large|maximum|exceed|refus)|too many (results|logs)|response size|exceed.*(blocks|results)/i.test(
            String(e),
          )
        ) {
          const mid = (from + to) / 2n;
          await readRange(from, mid);
          await readRange(mid + 1n, to);
          return;
        }
        throw e;
      }
      const bets: VolumeBet[] = [],
        seen = new Set<string>();
      for (const log of logs) {
        if (
          !log ||
          !hexQuantity(log.blockNumber) ||
          !hexQuantity(log.logIndex) ||
          !blockHash(log.blockHash) ||
          !blockHash(log.transactionHash) ||
          !Array.isArray(log.topics) ||
          !isAddress(log.address) ||
          log.address.toLowerCase() !== o.address.toLowerCase() ||
          BigInt(log.blockNumber) < from ||
          BigInt(log.blockNumber) > to ||
          log.removed
        )
          throw Error("Invalid or reorganized bet log");
        if (!topics.includes(log.topics[0]))
          throw Error("Unexpected log topic");
        if (BigInt(log.blockNumber) === to && log.blockHash !== before.hash)
          throw Error("Chain changed during scan");
        const key = `${log.transactionHash}:${BigInt(log.logIndex)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        bets.push(o.decode(log));
      }
      // Commit only whole, validated ranges. A failed request never becomes an
      // empty range, and a reload can resume an interrupted historical scan.
      if (
        this.checkpoint.lastHash &&
        (await header(this.checkpoint.lastBlock)).hash !==
          this.checkpoint.lastHash
      )
        throw Error("Chain changed during scan");
      if ((await header(to)).hash !== before.hash)
        throw Error("Chain changed during scan");
      abort(signal);
      this.checkpoint = {
        lastBlock: to,
        lastHash: before.hash,
        complete: false,
        wallets: aggregateBets(bets, this.checkpoint.wallets),
      };
      this.save();
      progress();
    };
    for (
      let from = this.checkpoint.lastBlock + 1n;
      from <= target;
      from += 2_000n
    )
      await readRange(from, from + 1_999n < target ? from + 1_999n : target);
    abort(signal);
    this.checkpoint.complete = true;
    this.save();
    return {
      rows: rankWallets(this.checkpoint.wallets),
      lastBlock: target,
      cached: false,
    };
  }
}
