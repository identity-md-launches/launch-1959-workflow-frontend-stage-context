import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { erc20Abi, zeroAddress } from "viem";
import { reader, useToken } from "./data";
import { amount, errorText, units } from "./model";
import { useTransactions } from "./transactions";
import { Action, AddressLink, ErrorNote, Field, Stat } from "./ui";
import type { PageProps } from "./Bet";
export function Stake({ r, g, ready }: PageProps) {
  const { address } = useConnection();
  const t = useToken(r, g?.stakingToken, address);
  const { send } = useTransactions();
  const [value, setValue] = useState(""),
    [withdraw, setWithdraw] = useState(""),
    [error, setError] = useState("");
  const q = useQuery({
    queryKey: ["stake", address],
    enabled: !!address && !!g && g.stakingToken !== zeroAddress,
    queryFn: async () => {
      const read = reader(r);
      const [stake, pending] = await Promise.all([
        read<readonly [bigint, bigint, bigint]>("stakes", [address]),
        read<bigint>("pendingStaking", [address]),
      ]);
      return { amount: stake[0], pending };
    },
    refetchInterval: 12000,
    retry: 1,
  });
  let n = 0n;
  try {
    n = amount(value, t.data?.decimals ?? 18);
  } catch {
    /* validate on click */
  }
  const approval =
    !!t.data && t.data.allowance !== undefined && t.data.allowance < n;
  const reset = approval && t.data?.allowance !== 0n;
  const enabled =
    ready &&
    !!t.data &&
    t.data.balance !== undefined &&
    t.data.allowance !== undefined &&
    !t.isError &&
    Date.now() - t.dataUpdatedAt < 45000 &&
    !q.isError &&
    Date.now() - q.dataUpdatedAt < 45000;
  async function deposit() {
    try {
      setError("");
      if (!g || !t.data || !enabled)
        throw Error("Wait for current staking state.");
      const n = amount(value, t.data.decimals);
      if (n > (t.data.balance ?? 0n))
        throw Error("This exceeds your available staking token balance.");
      if (n > g.MAX_POOL - g.totalStaked)
        throw Error("This exceeds the staking capacity.");
      await send(
        "stake",
        approval
          ? {
              address: g.stakingToken,
              abi: erc20Abi,
              functionName: "approve",
              args: [r.game.address, reset ? 0n : n],
            }
          : { functionName: "stake", args: [n] },
      );
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function unstake() {
    try {
      setError("");
      if (!t.data || !enabled) throw Error("Wait for current staking state.");
      const n = amount(withdraw, t.data.decimals);
      if (n > (q.data?.amount ?? 0n))
        throw Error("This exceeds your staked balance.");
      await send("unstake", { functionName: "unstake", args: [n] });
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <section className="section stake-section">
      <h2>Stake for a share</h2>
      <p className="muted">
        Earn a share of the 5% staking allocation at settlement.
      </p>
      {!g ? (
        <p role="status">Loading staking configuration…</p>
      ) : g.stakingToken === zeroAddress ? (
        <div className="empty-state">
          <img src="./favicon.svg" width="48" height="48" alt="" />
          <h3>Staking opens with the token</h3>
          <p>
            TEAM has not set the staking token. The allocation is held in
            reserve.
          </p>
          <Stat label="Pre-token reserve">
            {units(g.preStakingReserve)} IMD
          </Stat>
          <p className="small muted">
            The reserve releases across 30 eligible settlements after
            activation. Watch public settings below.
          </p>
        </div>
      ) : (
        <>
          <AddressLink
            value={g.stakingToken}
            r={r}
            label={`${t.data?.symbol ?? "Staking token"} contract`}
          />
          <div className="stats stake-stats">
            <Stat label="Total staked">
              {units(g.totalStaked, t.data?.decimals)} {t.data?.symbol}
            </Stat>
            <Stat label="Your stake">
              {units(q.data?.amount, t.data?.decimals)} {t.data?.symbol}
            </Stat>
            <Stat label="Your rewards">{units(q.data?.pending)} IMD</Stat>
            <Stat label="Reserve releases">
              {g.releaseWindows.toString()} / 30
            </Stat>
          </div>
          <div className="work-grid">
            <div>
              <Field
                label={`Stake amount · ${t.data?.symbol ?? "token"}`}
                id="stake-amount"
                hint={`Wallet balance: ${units(t.data?.balance, t.data?.decimals)} ${t.data?.symbol ?? ""}`}
              >
                <input
                  id="stake-amount"
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </Field>
              <Action
                r={r}
                id="stake"
                label={
                  approval
                    ? reset
                      ? "Reset token allowance"
                      : `Approve ${t.data?.symbol}`
                    : "Stake tokens"
                }
                disabled={!enabled}
                reason="Waiting for verified token balances."
                onClick={() => void deposit()}
              />
              {approval && (
                <p className="small muted">
                  Approve this amount to Hamster Hour, then stake in a separate
                  transaction.
                </p>
              )}
            </div>
            <div>
              <Field
                label={`Unstake amount · ${t.data?.symbol ?? "token"}`}
                id="unstake-amount"
                hint="No lock period. Principal returns to your wallet."
              >
                <input
                  id="unstake-amount"
                  inputMode="decimal"
                  value={withdraw}
                  onChange={(e) => setWithdraw(e.target.value)}
                />
              </Field>
              <Action
                r={r}
                id="unstake"
                label="Unstake tokens"
                disabled={!enabled || !q.data?.amount}
                reason="No available staked balance."
                onClick={() => void unstake()}
                primary={false}
              />
              <Action
                r={r}
                id="staking-claim"
                label="Claim IMD rewards"
                disabled={!enabled || !q.data?.pending}
                reason="No claimable rewards yet."
                onClick={() =>
                  void send("staking-claim", { functionName: "claimStaking" })
                }
                primary={false}
              />
            </div>
          </div>
          <ErrorNote message={error} />
          <p className="small muted">
            Weight is your stake at settlement, not how long you hold it. New
            stakes do not immediately release a backlog. USD values are
            unavailable.
          </p>
        </>
      )}
    </section>
  );
}
