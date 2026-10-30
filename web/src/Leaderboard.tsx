import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { formatUnits, type Address } from "viem";
import { normalize } from "viem/ens";
import { mainnet } from "viem/chains";
import type { Runtime } from "./config";
import type { LeaderboardData } from "./useLeaderboard";
import { volumeImd, type RankedWallet, type WalletVolume } from "./leaderboard";
import {
  LEADERBOARD_LIMIT,
  LEADERBOARD_PAGE_SIZE,
  LEADERBOARD_REWARD_TEXT,
  LEADERBOARD_TEAM,
} from "./leaderboard-config";
import { loadImdUsd } from "./rewards";
import { shortAddress, number } from "./model";
import { Hamster } from "./pixel";
import { Icon } from "./ui";

function Trophy({ rank = 1 }: { rank?: number }) {
  return (
    <svg
      className={`leaderboard-trophy trophy-${rank}`}
      viewBox="0 0 20 20"
      width="20"
      height="20"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path
        d="M5 2h10v2h4v6h-4v2h-3v3h3v3H5v-3h3v-3H5v-2H1V4h4zm0 4H3v2h2zm10 0v2h2V6z"
        fill="currentColor"
      />
      <path d="M8 4h2v5H8z" fill="var(--card)" opacity=".65" />
    </svg>
  );
}
function WalletName({ r, address }: { r: Runtime; address: Address }) {
  const [copy, setCopy] = useState("");
  const ens = useQuery({
    queryKey: ["leaderboard-ens", address],
    queryFn: async () => {
      // The site's custom chain intentionally carries only its game settings.
      // Use viem's canonical mainnet ENS deployment without changing that chain.
      const universalResolverAddress =
        mainnet.contracts.ensUniversalResolver.address;
      const name = await r.client.getEnsName({
        address,
        universalResolverAddress,
      });
      if (!name) return null;
      // A reverse record alone must never let one wallet impersonate another.
      const forward = await r.client.getEnsAddress({
        name: normalize(name),
        universalResolverAddress,
      });
      return forward?.toLowerCase() === address.toLowerCase() ? name : null;
    },
    staleTime: 3_600_000,
    retry: false,
  });
  return (
    <div className="leaderboard-wallet">
      <a
        href={`${r.deployment.network.explorer}/address/${address}`}
        target="_blank"
        rel="noreferrer"
        title={address}
        aria-label={`${ens.data ?? shortAddress(address)} on Etherscan, ${address}`}
      >
        <bdi>{ens.data ?? shortAddress(address)}</bdi>
        <Icon name="external" />
      </a>
      <button
        className="leaderboard-copy"
        type="button"
        aria-label={`Copy wallet address ${address}`}
        title="Copy wallet address"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(address);
            setCopy("Address copied");
          } catch {
            setCopy(`Copy unavailable. Select this address: ${address}`);
          }
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <rect x="6" y="6" width="10" height="11" rx="2" />
          <path d="M12 6V3H3v10h3" />
        </svg>
      </button>
      <span
        role="status"
        className={
          copy.startsWith("Copy unavailable")
            ? "leaderboard-copy-error"
            : "sr-only"
        }
      >
        {copy}
      </span>
    </div>
  );
}
function Volume({
  amount,
  pending,
  price,
}: {
  amount: bigint;
  pending: bigint;
  price?: number;
}) {
  const estimate =
    price === undefined ? undefined : Number(formatUnits(amount, 18)) * price;
  return (
    <span className="leaderboard-volume">
      <strong>
        {volumeImd(amount)} <span className="leaderboard-unit">IMD</span>
      </strong>
      {pending > 0n && (
        <small className="leaderboard-pending">
          {volumeImd(pending)} IMD pending
        </small>
      )}
      <small className="muted">
        {estimate !== undefined && Number.isFinite(estimate)
          ? `≈ ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(estimate)}`
          : "USD price unavailable"}
      </small>
    </span>
  );
}
function ScanStatus({
  data,
  compact = false,
}: {
  data: LeaderboardData;
  compact?: boolean;
}) {
  const [paused, setPaused] = useState(false);
  const p = data.progress;
  const percent =
    p && p.total > 0n
      ? Number((p.scanned * 10_000n) / p.total) / 100
      : undefined;
  return (
    <div className={`leaderboard-status ${compact ? "compact" : ""}`}>
      {!data.snapshot && (
        <div
          className={
            paused ? "leaderboard-runner motion-paused" : "leaderboard-runner"
          }
          aria-hidden="true"
        >
          <Hamster running small />
        </div>
      )}
      <div className="leaderboard-scan-copy">
        <p role="status">
          {data.retrying
            ? "Couldn't load the leaderboard, retrying…"
            : data.scanning || !data.snapshot
              ? data.snapshot
                ? "Updating bets…"
                : "Counting bets…"
              : `Through block ${number(data.snapshot.lastBlock)} · refreshes every minute`}
        </p>
        {(data.scanning || (!data.snapshot && p)) && (
          <>
            <progress
              aria-label="Bet history blocks scanned"
              max={100}
              value={percent}
            />
            <p className="small muted">
              {p
                ? `${number(p.scanned)} / ${number(p.total)} blocks scanned · ${Math.floor(percent ?? 0)}%`
                : "Finding the latest Ethereum block…"}
            </p>
          </>
        )}
        {data.retrying && (
          <button className="text-button" type="button" onClick={data.retry}>
            Retry now
          </button>
        )}
        {!data.snapshot && (
          <button
            className="text-button small leaderboard-pause"
            type="button"
            aria-pressed={paused}
            onClick={() => setPaused(!paused)}
          >
            {paused ? "Resume animation" : "Pause animation"}
          </button>
        )}
        {data.snapshot && (data.retrying || data.scanning) && (
          <p className="small muted">
            Showing saved totals through block {number(data.snapshot.lastBlock)}
            .
          </p>
        )}
        {!data.cacheAvailable && (
          <p className="small muted">
            Browser storage is unavailable. Totals are kept for this visit.
          </p>
        )}
      </div>
    </div>
  );
}
function NoBets() {
  return (
    <div className="leaderboard-empty">
      <p>
        No counted bets yet. Bets only count when both sides of the hour are
        taken. Bring a friend and play the same hour 🐹
      </p>
      <a className="button" href="#play">
        Place a bet <Icon name="arrow" />
      </a>
    </div>
  );
}
function usePrice(r: Runtime) {
  return useQuery({
    queryKey: ["imd-usd", r.token.address],
    queryFn: () => loadImdUsd(r.token.address),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
}
function VolumeRow({
  r,
  wallet,
  price,
  yours = false,
  team = false,
}: {
  r: Runtime;
  wallet: WalletVolume & { rank?: number };
  price?: number;
  yours?: boolean;
  team?: boolean;
}) {
  return (
    <tr
      className={`${wallet.rank && wallet.rank <= 5 ? `leaderboard-top rank-${wallet.rank}` : ""} ${yours ? "leaderboard-your-row" : ""} ${team ? "leaderboard-team-row" : ""}`}
    >
      <td className="leaderboard-rank">
        <span>{wallet.rank ? `#${wallet.rank}` : "—"}</span>
        {!!wallet.rank && wallet.rank <= 5 && <Trophy rank={wallet.rank} />}
      </td>
      <th scope="row" className="leaderboard-identity">
        {yours && (
          <span className="leaderboard-your-label">
            Your position
            {!wallet.rank &&
              (wallet.pending > 0n
                ? " · pending hours"
                : " · no counted bets yet")}
          </span>
        )}
        {team && (
          <span className="leaderboard-your-label">team, not ranked</span>
        )}
        {!team && !yours && !wallet.rank && (
          <span className="leaderboard-your-label muted">Pending hours</span>
        )}
        <WalletName r={r} address={wallet.address} />
      </th>
      <td className="leaderboard-amount">
        <Volume amount={wallet.volume} pending={wallet.pending} price={price} />
      </td>
      <td className="leaderboard-bets">
        <span>
          {number(wallet.bets)}
          <span className="leaderboard-mobile-label">
            {wallet.bets === 1 ? " bet" : " bets"}
          </span>
        </span>
        <small className="muted">{number(wallet.tickets)} EXACT</small>
      </td>
      <td className="leaderboard-hours">
        {number(wallet.hours.size)}
        <span className="leaderboard-mobile-label">
          {wallet.hours.size === 1 ? " hour" : " hours"}
        </span>
      </td>
    </tr>
  );
}
function VolumeHead() {
  return (
    <thead>
      <tr>
        <th scope="col">
          <span>Rank</span>
        </th>
        <th scope="col">
          <span>Wallet</span>
        </th>
        <th scope="col">
          <span>Counted volume</span>
        </th>
        <th scope="col">
          <span>Counted bets</span>
        </th>
        <th scope="col">
          <span>Hours played</span>
        </th>
      </tr>
    </thead>
  );
}
export function Leaderboard({
  r,
  data,
}: {
  r: Runtime;
  data: LeaderboardData;
}) {
  const [page, setPage] = useState(0);
  const { address } = useConnection();
  const price = usePrice(r);
  const rows = data.snapshot?.rows;
  const unranked = data.snapshot?.unranked ?? [];
  const team = unranked.find((w) => w.address === LEADERBOARD_TEAM);
  const pendingOnly = unranked.filter(
    (w) => w.pending > 0n && w.address !== LEADERBOARD_TEAM,
  );
  const top = [...(rows?.slice(0, LEADERBOARD_LIMIT) ?? []), ...pendingOnly];
  const pages = Math.max(1, Math.ceil(top.length / LEADERBOARD_PAGE_SIZE));
  const shownPage = Math.min(page, pages - 1);
  const visible = top.slice(
    shownPage * LEADERBOARD_PAGE_SIZE,
    (shownPage + 1) * LEADERBOARD_PAGE_SIZE,
  );
  const yours =
    address && rows && address.toLowerCase() !== LEADERBOARD_TEAM
      ? ([...rows, ...unranked].find(
          (w) => w.address === address.toLowerCase(),
        ) ?? {
          address,
          volume: 0n,
          pending: 0n,
          bets: 0,
          tickets: 0,
          hours: new Set<string>(),
        })
      : undefined;
  return (
    <div className="leaderboard-page">
      <div className="section-intro">
        <div>
          <h1>Leaderboard.</h1>
          <p>All-time betting volume on the wheel.</p>
        </div>
      </div>
      <section
        className="card leaderboard-card"
        aria-labelledby="leaderboard-title"
      >
        <div className="leaderboard-heading">
          <div>
            <h2 id="leaderboard-title">
              <Trophy /> Top 5 by volume
            </h2>
            {LEADERBOARD_REWARD_TEXT && (
              <p className="leaderboard-reward">{LEADERBOARD_REWARD_TEXT}</p>
            )}
          </div>
          <a className="text-link" href="#play">
            Back to the wheel <Icon name="arrow" />
          </a>
        </div>
        <ScanStatus data={data} />
        {rows && (
          <>
            {(top.length > 0 || yours) && (
              <table className="leaderboard-table">
                <caption className="sr-only">
                  Counted betting volume, ranked highest first. Top 50 ranked
                  wallets, followed by wallets with pending hours only; 10 per
                  page. Bets and hours include only counted stakes. Settled
                  EXACT tickets count as bets.
                </caption>
                <VolumeHead />
                {yours && (
                  <tbody className="leaderboard-yours">
                    <VolumeRow r={r} wallet={yours} price={price.data} yours />
                  </tbody>
                )}
                <tbody>
                  {visible.map((w) => (
                    <VolumeRow
                      key={w.address}
                      r={r}
                      wallet={w}
                      price={price.data}
                    />
                  ))}
                </tbody>
              </table>
            )}
            {rows.length === 0 && <NoBets />}
            {top.length > 0 && (
              <div className="leaderboard-pagination">
                <p className="small muted" role="status">
                  {shownPage * LEADERBOARD_PAGE_SIZE + 1}–
                  {Math.min(
                    (shownPage + 1) * LEADERBOARD_PAGE_SIZE,
                    top.length,
                  )}{" "}
                  of {top.length}
                  {rows.length > LEADERBOARD_LIMIT &&
                    ` · ${number(rows.length)} ranked wallets in all`}
                </p>
                <nav aria-label="Leaderboard pages">
                  <button
                    type="button"
                    disabled={shownPage === 0}
                    onClick={() => setPage(shownPage - 1)}
                  >
                    Previous
                  </button>
                  <span className="small">
                    {shownPage + 1} / {pages}
                  </span>
                  <button
                    type="button"
                    disabled={shownPage + 1 >= pages}
                    onClick={() => setPage(shownPage + 1)}
                  >
                    Next
                  </button>
                </nav>
              </div>
            )}
            {team && (
              <table
                className="leaderboard-table leaderboard-team"
                aria-label="Team wallet, not ranked"
              >
                <caption className="sr-only">
                  Team wallet, not ranked. Counted volume and pending hours.
                </caption>
                <VolumeHead />
                <tbody>
                  <VolumeRow r={r} wallet={team} price={price.data} team />
                </tbody>
              </table>
            )}
          </>
        )}
        <p className="leaderboard-method small muted">
          Only bets that were played count: refunded (one-sided or timed-out)
          bets and pending hours are not included. Team wallet is not ranked.
        </p>
      </section>
    </div>
  );
}
export function LeaderboardPreview({
  r,
  data,
}: {
  r: Runtime;
  data: LeaderboardData;
}) {
  const price = usePrice(r);
  const rows: RankedWallet[] | undefined = data.snapshot?.rows.slice(0, 5);
  return (
    <section
      className="card leaderboard-preview"
      aria-labelledby="leaderboard-preview-title"
    >
      <div className="leaderboard-heading">
        <h2 id="leaderboard-preview-title">
          <Trophy /> Top 5
        </h2>
        <a className="text-link" href="#leaderboard">
          Full leaderboard <Icon name="arrow" />
        </a>
      </div>
      {rows?.length ? (
        <ol className="leaderboard-preview-list">
          {rows.map((w) => (
            <li key={w.address} className={`rank-${w.rank}`}>
              <span className="leaderboard-rank">
                <Trophy rank={w.rank} />
                <span>#{w.rank}</span>
              </span>
              <WalletName r={r} address={w.address} />
              <Volume
                amount={w.volume}
                pending={w.pending}
                price={price.data}
              />
            </li>
          ))}
        </ol>
      ) : rows ? (
        <NoBets />
      ) : null}
      <ScanStatus data={data} compact />
    </section>
  );
}
