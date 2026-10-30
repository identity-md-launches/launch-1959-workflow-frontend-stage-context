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
export type VolumeBet = {
  type: "bet";
  bettor: Address;
  hour: bigint;
  amount: bigint;
} & ({ ticket: true; market?: never } | { ticket: false; market: number });
export type VolumeEvent =
  | VolumeBet
  | { type: "settled" | "timedOut"; hour: bigint }
  | { type: "voided"; hour: bigint; market: number };
interface WindowStake {
  address: Address;
  // null is an EXACT ticket, independent of binary market voids.
  market: number | null;
  volume: bigint;
  bets: number;
}
export interface VolumeWindow {
  settled: boolean;
  timedOut: boolean;
  voidedMarkets: Set<number>;
  stakes: Map<string, WindowStake>;
}
export interface WalletVolume {
  address: Address;
  volume: bigint;
  pending: bigint;
  bets: number;
  tickets: number;
  hours: Set<string>;
}
export interface RankedWallet extends WalletVolume {
  rank: number;
}
const validMarket = (market: unknown): market is number =>
  Number.isInteger(market) && Number(market) >= 0 && Number(market) <= 255;
const stakeKey = (address: Address, market: number | null) =>
  `${address}:${market ?? "ticket"}`;

// Retain per-window/market aggregates so a later settlement, void or timeout
// reclassifies earlier bets, even after a reload or across scan chunks.
export function aggregateEvents(
  events: readonly VolumeEvent[],
  previous: ReadonlyMap<string, VolumeWindow> = new Map(),
) {
  const windows = new Map(previous);
  const changed = new Set<string>();
  for (const event of events) {
    if (event.hour < 0n) throw Error("Invalid event window");
    const hour = String(event.hour);
    if (!changed.has(hour)) {
      const old = windows.get(hour);
      windows.set(hour, {
        settled: old?.settled ?? false,
        timedOut: old?.timedOut ?? false,
        voidedMarkets: new Set(old?.voidedMarkets),
        stakes: new Map(old?.stakes),
      });
      changed.add(hour);
    }
    const window = windows.get(hour)!;
    switch (event.type) {
      case "settled":
        window.settled = true;
        break;
      case "timedOut":
        window.timedOut = true;
        break;
      case "voided":
        if (!validMarket(event.market)) throw Error("Invalid market");
        window.voidedMarkets.add(event.market);
        break;
      case "bet": {
        if (
          event.amount < 0n ||
          !isAddress(event.bettor) ||
          (!event.ticket && !validMarket(event.market))
        )
          throw Error("Invalid bet event");
        const address = event.bettor.toLowerCase() as Address;
        const market = event.ticket ? null : event.market;
        const key = stakeKey(address, market);
        const stake = window.stakes.get(key);
        window.stakes.set(key, {
          address,
          market,
          volume: (stake?.volume ?? 0n) + event.amount,
          bets: (stake?.bets ?? 0) + 1,
        });
        break;
      }
    }
  }
  return windows;
}
export function walletVolumes(windows: ReadonlyMap<string, VolumeWindow>) {
  const wallets = new Map<string, WalletVolume>();
  for (const [hour, window] of windows) {
    for (const stake of window.stakes.values()) {
      const w = wallets.get(stake.address) ?? {
        address: stake.address,
        volume: 0n,
        pending: 0n,
        bets: 0,
        tickets: 0,
        hours: new Set<string>(),
      };
      wallets.set(stake.address, w);
      if (
        window.timedOut ||
        (stake.market !== null && window.voidedMarkets.has(stake.market))
      )
        continue;
      if (!window.settled) {
        w.pending += stake.volume;
        continue;
      }
      w.volume += stake.volume;
      w.bets += stake.bets;
      if (stake.market === null) w.tickets += stake.bets;
      w.hours.add(hour);
    }
  }
  return wallets;
}
export function rankWallets(
  wallets: ReadonlyMap<string, WalletVolume>,
  excludedAddresses: readonly Address[] = [],
): RankedWallet[] {
  const excluded = new Set(excludedAddresses.map((a) => a.toLowerCase()));
  return [...wallets.values()]
    .filter((w) => w.volume > 0n && !excluded.has(w.address.toLowerCase()))
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
export function decodeVolumeEvent(
  abi: Abi,
  log: RawVolumeLog,
  ticketPrice: bigint,
): VolumeEvent {
  const { eventName, args } = decodeEventLog({
    abi,
    data: log.data,
    topics: log.topics as [Hex, ...Hex[]],
    strict: true,
  });
  const a = args as unknown as {
    k: bigint;
    bettor?: Address;
    amount?: bigint;
    market?: number;
  };
  if (typeof a.k !== "bigint") throw Error("Invalid event window");
  if (eventName === "Settled") return { type: "settled", hour: a.k };
  if (eventName === "TimedOut") return { type: "timedOut", hour: a.k };
  if (eventName === "MarketVoided" && validMarket(a.market))
    return { type: "voided", hour: a.k, market: a.market };
  if (!a.bettor || !isAddress(a.bettor)) throw Error("Invalid bettor");
  if (eventName === "TicketBought")
    return {
      type: "bet",
      bettor: a.bettor,
      hour: a.k,
      ticket: true,
      amount: ticketPrice,
    };
  if (
    eventName === "BinaryBet" &&
    typeof a.amount === "bigint" &&
    validMarket(a.market)
  )
    return {
      type: "bet",
      bettor: a.bettor,
      hour: a.k,
      ticket: false,
      market: a.market,
      amount: a.amount,
    };
  throw Error("Unexpected or invalid volume event");
}
interface Checkpoint {
  lastBlock: bigint;
  lastHash?: Hex;
  complete: boolean;
  windows: Map<string, VolumeWindow>;
}
export interface ScanProgress {
  scanned: bigint;
  total: bigint;
  lastBlock: bigint;
  target: bigint;
}
export interface VolumeSnapshot {
  rows: RankedWallet[];
  unranked: WalletVolume[];
  lastBlock: bigint;
  cached: boolean;
}
export interface VolumeScannerOptions {
  chainId: number;
  address: Address;
  deploymentBlock: bigint;
  abi: Abi;
  decode: (log: RawVolumeLog) => VolumeEvent;
  excludedAddresses?: readonly Address[];
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
      windows: new Map(),
    };
  }
  private parse(raw: string): Checkpoint {
    const data = JSON.parse(raw);
    const decimal = (v: unknown): v is string =>
      typeof v === "string" && /^(0|[1-9]\d*)$/.test(v);
    if (
      !decimal(data.lastBlock) ||
      BigInt(data.lastBlock) < this.options.deploymentBlock ||
      !blockHash(data.lastHash) ||
      typeof data.complete !== "boolean" ||
      !Array.isArray(data.windows)
    )
      throw Error("Invalid checkpoint");
    const windows = new Map<string, VolumeWindow>();
    for (const w of data.windows) {
      if (
        !w ||
        !decimal(w.hour) ||
        windows.has(w.hour) ||
        typeof w.settled !== "boolean" ||
        typeof w.timedOut !== "boolean" ||
        !Array.isArray(w.voidedMarkets) ||
        !w.voidedMarkets.every(validMarket) ||
        new Set(w.voidedMarkets).size !== w.voidedMarkets.length ||
        !Array.isArray(w.stakes)
      )
        throw Error("Invalid window checkpoint");
      const stakes = new Map<string, WindowStake>();
      for (const stake of w.stakes) {
        if (
          !stake ||
          !isAddress(stake.address) ||
          !decimal(stake.volume) ||
          !Number.isSafeInteger(stake.bets) ||
          stake.bets < 1 ||
          (stake.market !== null && !validMarket(stake.market))
        )
          throw Error("Invalid stake checkpoint");
        const address = stake.address.toLowerCase() as Address;
        const key = stakeKey(address, stake.market);
        if (stakes.has(key)) throw Error("Duplicate stake checkpoint");
        stakes.set(key, {
          address,
          market: stake.market,
          volume: BigInt(stake.volume),
          bets: stake.bets,
        });
      }
      windows.set(w.hour, {
        settled: w.settled,
        timedOut: w.timedOut,
        voidedMarkets: new Set(w.voidedMarkets),
        stakes,
      });
    }
    return {
      lastBlock: BigInt(data.lastBlock),
      lastHash: data.lastHash,
      complete: data.complete,
      windows,
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
          windows: [...c.windows].map(([hour, w]) => ({
            hour,
            settled: w.settled,
            timedOut: w.timedOut,
            voidedMarkets: [...w.voidedMarkets],
            stakes: [...w.stakes.values()].map((s) => ({
              ...s,
              volume: String(s.volume),
            })),
          })),
        }),
      );
    } catch {
      this.cacheAvailable = false;
    }
  }
  private result(cached: boolean): VolumeSnapshot {
    const wallets = walletVolumes(this.checkpoint.windows);
    const rows = rankWallets(wallets, this.options.excludedAddresses);
    const ranked = new Set(rows.map((w) => w.address));
    return {
      rows,
      unranked: [...wallets.values()]
        .filter((w) => !ranked.has(w.address))
        .sort((a, b) => a.address.localeCompare(b.address)),
      lastBlock: this.checkpoint.lastBlock,
      cached,
    };
  }
  snapshot(): VolumeSnapshot | undefined {
    return this.checkpoint.complete ? this.result(true) : undefined;
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
      const events: VolumeEvent[] = [],
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
        events.push(o.decode(log));
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
        windows: aggregateEvents(events, this.checkpoint.windows),
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
    return this.result(false);
  }
}
