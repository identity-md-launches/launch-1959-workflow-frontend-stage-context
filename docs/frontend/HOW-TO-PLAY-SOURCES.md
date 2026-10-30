# How to play: rule verification

The guide at `#docs` documents the four v2 addresses explicitly supplied in this assignment. The pinned historical deployment handoff describes v1; the existing v2 handoff in `web/deployment/handoff.json` already supplies the current game identity. No address, ABI, fee, contract source, wallet flow or betting implementation was changed. `web/src/docs-rules.ts` holds immutable explanatory values; transactions never import it.

## Source identity

Fetched the exact Solidity source below and reproduced its runtime using solc **0.8.26**, Cancun and `metadata.bytecodeHash = none`. Solidity source and compiler dependencies were fetched into disposable scratch space, without Git submodules or changes to the repository's protected dependencies. The source URLs and SHA-256 hashes, runtime Keccaks, build settings, live constants and boundary calls are retained in [contracts.json](how-to-play/contracts.json).

| Runtime | Exact source revision | Optimizer | Runtime bytes | Comparison |
| --- | --- | --- | --- | --- |
| [HamsterHour](https://github.com/identity-md-launches/launch-2260-build-hamster-hour-v2/blob/49f53ca0f278fe4edf6431f68a51468552372af7/src/HamsterHour.sol) | `49f53ca0f278fe4edf6431f68a51468552372af7` | 200 runs, no via-IR | 23,289 | Match |
| [HamsterVault](https://github.com/identity-md-launches/launch-2304-project-site-https-hamsterhour-fun-launc/tree/69ca386ed1d5ea7529caf7b75c348159bf488885/src) | `69ca386ed1d5ea7529caf7b75c348159bf488885` | 1 run, via-IR | 24,421 | Match |
| [HamsterHook](https://github.com/identity-md-launches/launch-2336-hamster-hour/blob/bf12d716b9268cbe820ee776be2a990b4f2c09bd/src/HamsterHook.sol) | `bf12d716b9268cbe820ee776be2a990b4f2c09bd` | 200 runs, no via-IR | 11,106 | Match |
| [HamsterToken](https://github.com/identity-md-launches/launch-2336-hamster-hour/blob/bf12d716b9268cbe820ee776be2a990b4f2c09bd/src/HamsterToken.sol) | Same hook revision | 200 runs, no via-IR | 1,722 | Match |
| HamsterBoost, reached from vault `boostEngine()` | Same vault revision | 1 run, via-IR | 18,376 | Match |

Comparison substitutes only compiler-designated immutable byte ranges from the deployed code; every other byte matches. The token and boost runtimes match without substitutions. Key constructor-set identities were also read through getters. All 158 game ABI entries and 132 vault ABI entries match the locally compiled entries as complete sets: Foundry and solc order those entries differently, so raw array hashes differ. Existing frontend ABIs and their integrity hashes are preserved.

Ethereum read snapshot: block **26,307,073**, timestamp **1793381375**, using the contributor-provided transport for the public source **https://ethereum-rpc.publicnode.com**. Runtime identities and readings are evidence from this worker, not an independent security audit. Etherscan pages were unavailable through the web tool, so source identity was established by recompilation and live bytecode comparison instead.

## Rule map

Game locations below refer to `src/HamsterHour.sol` at the revision above. Vault locations refer to the linked vault revision. A constant is not inferred from existing UI copy.

| Guide content | Source / checked behavior |
| --- | --- |
| Real wheel, Squeekchain data, oracle settlement | Game `question()` binds six published PASSES values to Squeekchain; `_recordResult` (line 521) checks the IMD attester signature and exact question. Real-animal context is also supplied by the requester. |
| One hour from :20 UTC | `GENESIS = 1791847200` = 12 October 2026 23:20 UTC; `ROUND_DURATION = 600`, `WINDOW_ROUNDS = 6`, `WINDOW_DURATION = 3600`; `windowStart` (262), `windowEnd` and `windowInfo`. |
| Betting opens 24 hours ahead; closes at start | `OPEN_AHEAD = 86400`; `isBettingOpen` (281) requires `now < startsAt <= now + OPEN_AHEAD`. |
| Result and settlement timing | `question()` requires every round published as settled and rejects missing data as zero; `_recordResult` accepts only `end <= now < end + TIMEOUT`. `TIMEOUT = 172800`. No guaranteed real-time settlement delay is stated. |
| OVER / UNDER | `MIN_BET = 0.5 IMD`; `_binaryEntitlement` uses `result > line`, equality is UNDER; `_ouVoid` (781) refunds if below 100 or either side is empty. `lineFor` and `scheduleLine` preserve an open window's line. Live `line()` read was 2,100. |
| SNOOZE | `SNOOZE_THRESHOLD = 100`; `_binaryEntitlement` pays YES below 100, otherwise NO. Same 0.5 IMD minimum and pari-mutuel share. `_snVoid` (786) refunds one-sided markets. |
| EXACT price, limits and tolerance | `TICKET_PRICE = 5 IMD`, `MAX_TICKETS = 256`, `buyTicket` (320) enforces one ticket per address/window; `isWinningGuess` (693) uses `abs(guess-result) * 200 <= result`. Live calls for result 2,000: 1,990 and 2,010 win; 2,011 loses. `_finalizeOne` never awards a jackpot below 100. |
| Jackpot split and carry | `JACKPOT_PAYOUT_PCT = 80`; `_finalizeOne` (634) divides that amount equally by winners with integer rounding; the rest carries. With no winners, share is zero and all carries. `finalize` processes windows in order, separately from recording the oracle result. |
| Binary fees | Constants at 47–50 are stakers 5%, jackpot 2%, oracle 1%, team 1%; `_winnerPool` (791) deducts these from the whole two-sided pool. Winners get 91% subject to contract integer rounding. Voids and timeouts pay no game fees. |
| Ticket fees | Constants at 52–54 are stakers 5%, oracle 1%, team 1%; `_allocate` (551) contributes the remaining 93% to the jar, not directly to winners. The table's winners row deliberately refers to the separate 80% jar payout rather than double-counting it as a ticket percentage. |
| Worked payout | 15 IMD × 91% = 13.65 IMD to the only OVER bettor, including 10 IMD principal; net profit 3.65 IMD. UNDER receives 0. Fees: 0.75 + 0.30 + 0.15 + 0.15 = 1.35 IMD. Network gas is separate. |
| Refund and claim flow | `_timeout`, `_entitlements`, `_ouVoid`, `_snVoid`, `claim` (736) and `claimable`. Timeout is permissionless but requires a transaction after the 48-hour deadline; it is not automatic at the wall-clock boundary. `claim` has no expiry and can be called again after jackpot finalization. Actual site labels and sequential Claim all are in `web/src/MyBets.tsx`. |
| Eligible mining loss | `lossOf` (839) computes net binary loss across both markets after refunds/payouts; EXACT is excluded. Vault `HamsterMining.claimable` (140), `claimMined` (161), and Boost `_lossRange` require finalized loss history and allocate the window budget pro rata. |
| Mining rate and halvings | `HALF_LOSS = 18,750 IMD`; base allocation 750M HAMSTER; Boost `emissionCurve` (406), `_miningState` (624), `rateAndHalving` (653): base 20,000 per IMD, divided by two at each band. Live calls at 0 / 18,750 / 37,500 / 56,250 IMD returned 20,000 / 10,000 / 5,000 / 2,500. Vault delegates to its immutable Boost engine, whose runtime was also matched. The table is labelled as the base curve because a dormant boost sweep can extend future emissions. |
| Mining grants | Vault `HamsterStaking._grant` (234) creates a grant and stake lot; `VESTING = 7 days`; `vested` releases linearly; `withdrawVested` (291) sends unlocked tokens to the grantee. The site uses $HAMSTER → Mine → Claim all → Withdraw vested, with bounded batches. |
| Staking schedule | Vault `WARMUP = 86400`, `UNSTAKE_DELAY = 86400`, `VESTING = 604800`, `HOOK_STREAM = 604800`, `GAME_STREAM = 2592000`. `stake` (224), `requestUnstake` (258), `withdrawUnstaked` (270), `_stream` (310), `claimRewards` (351), and `_step` pause emissions at zero earning weight. Request unstake stops weight immediately. Actual site labels verified in `web/src/Hamster.tsx`. |
| Staker trading share | Hook `_accrue` (292): `gross * 50 / BPS`, `BPS = 10000`, so 0.5% of gross IMD on both buy and sell; `deliverCredit` forwards to `depositRewards`. Vault `pullGameRewards` streams game fees over 30 active days. Game `stakingRecipient()` live-matches the given vault. |
| Leaderboard | Existing `web/src/leaderboard.ts` consumes `Settled`, `MarketVoided`, `TimedOut` alongside stakes; only played, non-refunded volume is ranked. Team exclusion matches the game's live `TEAM()` getter. This is an index built from contract events, not a contract-supplied ranking. |
| Configurable rewards | The request supplies the reward text; it is not a contract payout. Both docs and existing leaderboard read the one `LEADERBOARD_REWARD_TEXT` constant. |
| No owner withdrawal | Full matching game source exposes no arbitrary withdrawal, ownership, upgrade or pause; `withdraw` pays only the caller's assigned balance. Team's restricted future settings are described rather than implying no settings exist. Vault/token/hook source and exact runtimes were also inspected. |
| IMD and contract addresses | Existing runtime handoff and `HAMSTER` configuration are reused; live token/vault/hook getter links agree. No alternate address or deployment was invented. IMD acquisition links to the existing bet panel's Uniswap flow. |
| Agent install | Existing Agents tab, `web/public/SKILL.md` and bundled `.well-known/agent-skills` assets; exact command from the request. Skill archive and discovery index preserved. |

## Observations and provenance, distinct from contract rules

The night-activity note (roughly 21:00–06:00 UTC) is supplied by the requester and corroborated by the existing `web/public/telemetry/stats30.json` snapshot generated 20 October 2026. Summing its UTC typical-day buckets places over 99.9% of recorded mean passes in that interval. Its coverage is partial and it is historical, so the guide calls this an observed tendency, never a guarantee or a settlement rule. No real-time wake prediction is added.

“Built, audited and deployed by the IMD swarm” is project provenance explicitly requested by the requester. Source and runtime checks do not establish an independent audit or guarantee safety; this worker makes no such certification. The short betting-risk note remains visible in the guide.
