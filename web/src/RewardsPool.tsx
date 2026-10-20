import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { formatUnits } from "viem";
import type { Runtime } from "./config";
import { Help } from "./ui";
import { imd, number } from "./model";
import {
  useRewards,
  loadRewardWeight,
  loadPoolPrice,
  loadImdUsd,
  estimatedApr,
  personalDaily,
  stakeShare,
} from "./rewards";

const percent = (n: number | undefined) =>
  n === undefined
    ? "—"
    : n > 0 && n < 0.01
      ? "<0.01%"
      : `${number(n, { maximumFractionDigits: 2 })}%`;
const usd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);

export function RewardsPool({ r }: { r: Runtime }) {
  const { address } = useConnection();
  const rewards = useRewards(r);
  const pool = useQuery({
    queryKey: ["hamster-pool-price"],
    queryFn: () => loadPoolPrice(r),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const price = useQuery({
    queryKey: ["imd-usd", r.token.address],
    queryFn: () => loadImdUsd(r.token.address),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const g = rewards.data;
  const account = useQuery({
    queryKey: ["hamster-reward-weight", address, g?.blockNumber.toString()],
    queryFn: () => loadRewardWeight(r, g!, address!),
    enabled: !!address && !!g?.state,
    retry: 1,
  });
  const rate = g?.daily;
  const apr =
    rate !== undefined && pool.data !== undefined && price.data !== undefined
      ? estimatedApr(rate, g!.totalStaked, pool.data, price.data)
      : undefined;
  const weight = account.data;
  const share =
    g?.state && weight !== undefined
      ? stakeShare(weight, g.state.weight)
      : undefined;
  const yours =
    g?.state && rate !== undefined && weight !== undefined
      ? personalDaily(rate, weight, g.state.weight)
      : undefined;
  const unavailable =
    rewards.isError ||
    (!!g && !g.state) ||
    pool.isError ||
    price.isError ||
    account.isError;
  return (
    <div className="rewards-pool" role="group" aria-label="Rewards pool">
      <div className="row">
        <h3>Rewards pool</h3>
        <Help label="rewards pool estimates">
          Waiting IMD is all drip, hook and game deposits minus rewards paid,
          including unclaimed rewards. The current daily rate is about 1% of the
          remaining drip plus active stream rates. Hook streams run for 7 active
          days; game streams follow the vault’s 30-day schedule. Emissions pause
          without earning stake. APR annualizes this rate without compounding or
          future deposits; streams can end. Stake value includes vesting grants
          and warming stakes, priced from the HAMSTER/IMD pool. USD uses the
          most liquid IMD pair reported by DexScreener. Your share uses earning
          stake, including grants, after the 24-hour warm-up.
        </Help>
      </div>
      <dl className="hamster-figures rewards-figures">
        <div>
          <dt>IMD waiting for stakers</dt>
          <dd>{imd(g?.waiting, 4)} IMD</dd>
          <dd className="small muted">
            {g && price.data !== undefined
              ? `≈ ${usd(Number(formatUnits(g.waiting, 18)) * price.data)}`
              : price.isPending
                ? "Reading USD price…"
                : "USD price unavailable"}
          </dd>
        </div>
        <div>
          <dt>Releasing now</dt>
          <dd>{imd(rate, 4)} IMD / day</dd>
          <dd className="small muted">
            {g?.state?.weight === 0n
              ? "Paused · no earning stake"
              : "Estimated current rate"}
          </dd>
        </div>
        <div>
          <dt>Estimated APR for stakers</dt>
          <dd>{percent(apr)}</dd>
          <dd className="small muted">
            {g?.totalStaked === 0n
              ? "No stake yet"
              : "Changes with stake and price"}
          </dd>
        </div>
        {address && (
          <>
            <div>
              <dt>Your stake share</dt>
              <dd>{percent(share)}</dd>
              <dd className="small muted">
                Earning stake · includes vesting grants
              </dd>
            </div>
            <div>
              <dt>Your IMD per day</dt>
              <dd>{imd(yours, 4)} IMD / day</dd>
              <dd className="small muted">Estimate · after the 24h warm-up</dd>
            </div>
          </>
        )}
      </dl>
      <p className="small muted">
        Estimates change with stake and price. Future rewards are not
        guaranteed.
      </p>
      <div className="small muted" role="status">
        {unavailable && (
          <>
            Some reward estimates are unavailable.{" "}
            <button
              className="text-button"
              onClick={() => {
                void rewards.refetch();
                void pool.refetch();
                void price.refetch();
                if (address && g?.state) void account.refetch();
              }}
            >
              Retry rewards
            </button>
          </>
        )}
      </div>
    </div>
  );
}
