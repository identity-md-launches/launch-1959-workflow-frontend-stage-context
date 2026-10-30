# Hamster Hour design

## Overview

Hamster Hour is a single-page React game for people betting IMD on a real hamster's next hour. The implemented direction is “cozy pixel”: warm paper, a large tight headline ending in a peach period, an original geometric hamster/cage/wheel, rounded cards and small pixel counters. The illustration is original SVG in `web/src/pixel.tsx`, not a character from another property. Seven hash pages share a header and runtime data: The wheel, Jackpot, Stats, Leaderboard, My bets, Agents and $HAMSTER. Home contains only the headline/help, one live-camera/mascot frame with passes and seeds, the betting form, a compact jackpot strip, a one-line event ticker, and the Top 5 preview at the bottom. Other pages retain the footer. A floating chat control opens a drawer on every page. The worker extension is a separate deployment handoff; it preserves the existing camera/chat endpoint behavior, including chat preflight, and is not a static runtime dependency bundle.

The source of truth is `web/src/styles.css`, with component composition in `App.tsx`, `Bet.tsx`, `Jackpot.tsx`, `Stats.tsx` and `MyBets.tsx`. `DESIGN.md` describes the final implemented system; current leaderboard validation and observed limitations are in `docs/frontend/PLAYED-VOLUME-VALIDATION.md`, with earlier reviews retained separately.

## Colors

The shared palette uses CSS properties, switched by the root `data-theme` attribute. Automatic mode follows fresh positive wheel speed; a visitor can select day/night manually or restore Auto theme in the footer.

| Role/token        | Day       | Night / use                             |
| ----------------- | --------- | --------------------------------------- |
| `--bg`            | `#FFF5E6` | `#1E1A2E`                               |
| `--card`          | `#FFFBF4` | `#29233D`                               |
| `--ink`           | `#2B2118` | `#FFF5E6`                               |
| `--muted`         | `#796451` | `#BEAFCF`                               |
| `--leaderboard-muted` | `#6F6B66` | `#BDB7C7`; pending text and team row |
| `--line`          | `#E9D9C3` | `#493D5B`                               |
| `--hover`         | `#F4E9D8` | `#362E4B`                               |
| `--focus`         | `#80502C` | `#FFE08A`                               |
| `--error`         | `#A52F2F` | `#FFB3BD`                               |
| `--peach`         | `#FFB48A` | Primary action / selected OVER          |
| `--butter`        | `#FFE08A` | Jackpot / quick amount / hover          |
| `--mint`          | `#A8E6C6` | Activity / wins                         |
| `--lilac`         | `#CDB8FF` | Selected SNOOZE / wheel                 |
| `--over`          | `#E07A3E` | OVER rail / button shadow               |
| `--under`         | `#5B8DEF` | UNDER rail / button shadow              |
| `--snooze`        | `#9A6FE0` | SNOOZE rail / button shadow             |
| `--chart-outline` | `#527E63` | Night `#A8E6C6`; visible bar boundaries |

The brief's `#8A7765` is retained as `--muted-brand`; body metadata uses the darker `--muted` for contrast. `--rose: #FF9AA8` remains a palette primitive without a current control role. Selected UNDER uses a pale `#C9DDFF` fill with its specified blue shadow. Status always has text as well as color. Results keep their numbers in `--ink` and use category-colored top edges. The jackpot stays `#29233D` in both themes, with butter numbers and `#C4B6CF` secondary copy.

Computed solid-token ratios: day ink/page 14.59:1, day muted/card 5.42:1, night ink/card 13.88:1, night muted/card 7.29:1, dark ink/peach 9.11:1, jackpot butter/card 11.61:1. These calculations are for the stated solid token pairs. Rendered checks and decorative/image limitations are recorded in validation.

The leaderboard reuses these surfaces and foregrounds. Rank 1 mixes 15% butter into the card, rank 2 mixes 10% `#A4ADBF`, and rank 3 mixes 13% peach. Ranks 4–5 use a soft radial lilac glow (16% lilac at its center). These are rank cues, reinforced by explicit rank numbers and a pixel trophy. Trophy colors are gold `#94630D`, silver `#686D7D`, bronze `#A5623E`, and lilac `#7D5B9E` in day mode; night uses butter, `#C9CEDD`, peach and lilac. Row text continues to use `--ink` and `--muted`. The connected wallet row uses the existing `--focus` color for its border. No shared palette value changes.

## Typography

Two local families, four WOFF2 files in `web/src/assets/`:

- Geist regular 400, semibold 600 and bold 700 for interface text, headings and body copy; fallback Arial/sans-serif.
- Silkscreen regular 400 for the big pass count, line, jackpot, category tags and headline statistics; fallback monospace.

Six size tokens: `--small` 12px, `--label` 14px, `--body` 16px, `--heading` 20px, `--number` 40px, `--display` 82px. Display becomes 88px at 1440+, 62px at 1100 and below, 48px at 800 and below, and 40px below 360. The home headline specifically uses the 40px number token on mobile, preserving room for the frame and betting action. Numeric labels use tabular figures. Silkscreen is never used for paragraphs. Body line-height is 1.5; the main headline is 1.02, or 1 on mobile, with -0.065em tracking. Section headings use -0.025em. Controls use native labels and no tracked uppercase eyebrow.

The mobile amount, chat and modal inputs are at least 16px; the main amount is 20px. Mobile native selects are 16px. The word IMD is a separate nonwrapping flex item. Font licenses are shipped in `dist/fonts/`.

## Layout

`.site` is centered, normally at most 1280px including 40px side padding. At 1440+ it is at most 1340px with 50px padding; padding falls to 28px, 22px, then 16px as space narrows. Most layout gaps are 24px, then 20/18px on smaller screens; component gaps use 4, 8, 10, 12 and 16px.

At desktop, the single camera/mascot habitat occupies the leading column and the betting form the trailing column, using `1.4fr / 1fr` with a minimum 350px betting column. The compact dark jackpot strip and single-line horizontally scrollable ticker follow the grid. No history, activity chart, full jar, feeding, inline chat, duplicate My bets, mining teaser or agent pitch remains on home.

Breakpoints are 1440, 1100, 800, 680 and 359px. At 1100 and below, the navigation links take their own header row; the seven-link row scrolls when needed. The navigation can also shrink and scroll independently on desktop rather than widening the page. At 680 and below, the habitat precedes the bet panel. The frame is 124px high; desktop uses 340px, or 290px at 1100 and below. Camera and pixel art use the same dimensions, so changing stream state does not shift the form. The mobile headline is 40px, help shares the subtitle row, category arrows are omitted, and the line label sits beside its number. The normal primary button follows the amount field; the approval step description follows the button. The duplicated fixed betting bar was removed. At 390×844 the frame, all three choices, amount and primary button are visible.

Mobile `.site` scrolls within `100dvh - 64px - safe-area-inset-bottom`, reserving a clear bottom utility area for chat rather than covering betting controls. The chat launcher has a 44px minimum height and sits 10px plus safe area above the bottom on mobile. At desktop it sits 18px above the bottom. The native modal chat drawer opens from the right, at most 420px wide; it fills mobile viewport height. Other dialogs retain the existing bottom-sheet behavior on phones. Closing restores the trigger; Escape and backdrop click dismiss unlocked sheets. Hash changes reset the page scroll, and the skip link focuses main without changing tabs.

Jackpot holds the full jar, local-time hour selector, ticket action, feeding and feed list. Stats holds one usual-day chart with 7/30-day controls, then the last 24 finished game windows, records and game totals. Results run newest first in a named keyboard-scrollable region. Result cells size to complete numbers; counters and summary values can wrap rather than collide with adjacent content. Exact observed counts are independent of betting activity. The game windows start at :20; positive partial half-hour buckets are never prorated to manufacture an hourly result. Settled oracle counts are labelled separately when exact observations are absent. Missing data stays unknown. My bets keeps claims; Agents keeps the skill link and install command.

Final Chromium interaction and accessibility checks covered 320, 390, 800 and 1440 CSS pixels in both themes. Day/night screenshots, long values, the Top 5 preview and the real-chain board were inspected after the last UI source change. Mobile browser emulation is not a physical-device or native 200% zoom test.

The $HAMSTER page retains the two-column `.hamster-grid`, stacking below 800px. Its Stake and Stats cards each embed `RewardsPool` (`web/src/RewardsPool.tsx`) immediately after the card heading. The block uses the existing two-column `.hamster-figures` definition list with 16px gaps. Values use Geist semibold at `--heading` (20px) with tabular figures and `overflow-wrap: anywhere`; labels use `--label` (14px), supporting USD/estimate copy uses `--small` (12px). The block heading is 16px bold. All text uses existing `--ink`/`--muted` theme tokens on `--card`; it adds no colors, fonts, animation, border, shadow or nested card.

The reward explanation reuses native `Help` details/summary, aligned to the trailing edge so the 290px popover fits within the phone card. A named group, heading and definition list expose the data; a stable status region carries unavailable/retry feedback. Missing values remain an em dash, zero earning weight is explicitly paused, and connected wallet rows appear only for that account. The retry button reuses `.text-button` and existing focus styles. Live data refreshes without changing the number style; row heights remain content driven and units can wrap without clipping a value. Both theme variants and 320/390/800/1440 widths were inspected or exercised in Chromium; native zoom and physical devices were not tested.

The compact jackpot strip retains its existing dark palette. Its new `.jackpot-next-prize` line takes a full flex row at `--small` in the existing secondary color. The total and its IMD unit retain their pixel/Geist treatment. The full Jackpot card labels the total as carried seed plus all pending deposits and keeps the next-hour fixed prize in its existing details area.

The leaderboard has a single 26px card. Each highlighted row owns one background; its mobile cells stay transparent so the rank 4–5 glow spans the whole row without repeating behind individual values. Desktop rows retain native table headings for rank, wallet, volume, bets and hours; rank, wallet and amount widths are 11%, 31% and 28%, with 14%/16% for counts. At 680px and below, each row becomes a three-column grid (28px rank plus two flexible columns): wallet/volume on the first line, bets/hours on the second. Counts gain visible labels, and EXACT counts remain visible. Long ENS names and amounts wrap without truncation; wallet links expose their full address and copying remains available. The table shows the top 50 ranked wallets followed by wallets with pending stakes only, ten rows per page. Pending-only wallets have no numeric rank or trophy. A separate first tbody pins the connected non-team wallet's position even beyond rank 50; pagination changes only the main tbody. Bets, EXACT subtotals and distinct hours show only counted stakes. A wallet with both played and pending stakes keeps its counted rank.

`Volume` displays counted IMD in semibold, a grey `--small` (12px/18px) pending sub-label only above zero, then the counted USD estimate. Pending amounts are never included in the USD estimate. The pending text wraps naturally in the existing amount column; it has no new badge or motion. The new neutral `--leaderboard-muted` is defined in the existing day/night token blocks. Browser-measured solid foreground/card contrast is 5.13:1 in day mode and 7.68:1 at night; film grain and gradient surfaces are not represented by these solid-pair ratios.

The team wallet, if it has bet history, is a separate `.leaderboard-table.leaderboard-team` below pagination, with the same column widths and mobile grid, 20px top spacing, neutral grey text and regular-weight amounts. It reads “team, not ranked” and never uses a rank/trophy/highlight or the pinned position row. Its column headers remain accessible while their text is visually hidden. Fully refunded team history still produces a zero row. The empty state gives the requested explanation and Place a bet link to `#play`, even when pending-only or team rows are present.

The Top 5 preview uses the same wallet and amount components in five compact list rows. It is appended after the existing activity ticker, so the betting first screen retains its geometry. Its Full leaderboard hash link opens the full view. Leaderboard headings, counts and text use only existing size tokens, with tabular numerals. All new controls inherit the shared visible focus treatment; copy buttons are 32px square, pagination buttons at least 44px high, and wallet links at least 32px high. The loader reuses the original running hamster in a 180px illustration (140px on mobile), with labelled native progress and a Pause animation control. Reduced motion disables its loops through the existing global media query.

## Elevation & Depth

Cards use a 1px warm border and no shadow. A very low-opacity fixed SVG turbulence overlay supplies film grain and ignores pointer events. The habitat has a faint square grid. Activity plots and the share card add small dotted/grid touches.

The requested chunky action treatment is intentional: main buttons use a 4px downward colored shadow plus a 1px dark border. Category buttons have corresponding shadows. This is a documented exception to the probe's generic “border and shadow together” preference. Help popovers and account menus are elevated; dialogs use the native top layer, a dark translucent backdrop and 4px backdrop blur. The chat launcher is z-index 45, errors 80, and skip navigation 100. A native dialog sits in the browser’s top layer.

## Shapes

Cards and dialogs have 26px outer corners, within the requested 22–28px range. Buttons and navigation pills use 99px radii. Category choices and desktop video frames use 16px; mobile frames use 12px; the compact jackpot strip uses 22px; fields use 12–14px; graph bars use 4–5px. The pixel illustration deliberately uses stepped hard corners and `shape-rendering: crispEdges` instead of rounded illustration geometry.

## Components

`Leaderboard` and `LeaderboardPreview` in `web/src/Leaderboard.tsx` share the wallet/ENS/copy, amount, trophy, empty and scanning components. `useLeaderboard.ts` owns active-tab refresh and recovery; `leaderboard.ts` owns the reusable data logic. Loading, empty, failure, retry, cached, paginated, pending and connected variants retain the same card geometry. Pending and team variants use the dedicated neutral text token described above. Only complete historical snapshots become rankings; a failed refresh retains the prior block-labelled table. The final source uses six public read-only RPC endpoints with fallback; none changes wallet or betting configuration. Optional reward copy is configured in `leaderboard-config.ts`.

`RewardsPool` in `web/src/RewardsPool.tsx` is the shared read-only rewards block for both HAMSTER cards. It uses `web/src/rewards.ts` for block-pinned vault accounting, earning-weight shares, pool price, USD conversion and APR; all wallet transactions continue through the existing staking card. Loading/error/paused/connected variants and the retry control are covered in the current validation report.

| Component / source                               | Use and behavior                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CardHead`, `Help` · `ui.tsx`                    | Consistent heading/action alignment. The question mark is native details/summary, usable with keyboard and pointer. Text stays readable in both themes.                                                                                                                                                |
| `BetPanel` · `Bet.tsx`                           | Local-time hour, large line, three category buttons, independent SNOOZE yes/no, live return estimate, amount/quick picks, approval step, review dialog and timeline. The primary form action is shared across breakpoints. Inline failures preserve input. A review freezes account/hour/side/amount and rechecks closing before sending. |
| `WalletProvider`, `WalletControl` · `Wallet.tsx` | EIP-6963 extensions, mobile wallet links, Coinbase passkey wallet, switch-chain and account menu. Native dialog closes with Escape/backdrop/close button and restores focus.                                                                                                                           |
| `Sheet` · `Sheet.tsx`                            | Native modal shared by review, ticket, feed, share and the chat drawer via an optional className. Focus stays inside; closing restores the trigger. Pending transactions prevent accidental dismissal.                                                                                                                                            |
| `TransactionProvider` · `transactions.tsx`       | Verification → simulation → wallet → receipt. Visible pending/failure/success text and explorer link; duplicate sends are locked while a transaction is pending.                                                                                                                                       |
| `Hamster`, `Seed`, `Jar` · `pixel.tsx`           | Original code-native illustration. Fresh speed switches sleep/run and wheel movement. Six telemetry seeds and the decorative coin jar accompany readable numeric values. Unknown readings remain unknown.                                                                                              |
| `Activity`, `Stats` · `Stats.tsx`                | Local-hour telemetry chart, now marker, 7/30-day filters, finished-window history, records and event statistics. Charts have contrasting edges and accessible text. Saved data is dated and identified.                                                                                                                         |
| `Jackpot` · `Jackpot.tsx` | Full jar/feeds on its page; compact amount, direct ticket button and tab link on home. Both views share the existing exact-approval and ticket/feed transaction paths. |
| `history.ts` | Filters finished windows, orders newest first, calculates exact observation totals and names independent market winners/refunds. No-bet windows can still show actual passes. |
| `MyBets` · `MyBets.tsx`                          | Wallet-specific positions, claimable IMD, per-hour claim and sequential Claim all. New wins show a banner and optional jingle/confetti. Empty and failed reads have explicit states.                                                                                                                   |
| `Stream`, `Chat` · corresponding files           | Existing cam and signed chat protocols. Video appears only for an explicitly live YouTube ID with a fresh observedAt and unexpired validUntil. Poll errors/expiry unmount it; no saved or hard-coded recording fallback exists. Reduced motion disables video autoplay. Pausing video also stops mascot motion. ChatDrawer opens the same signed chat in a native dialog on every tab.                                                                                                                                     |
| `Share` · `Share.tsx`                            | Locally rendered PNG with exact side, amount, line and local time, download and X intent. Text is fitted to the canvas rather than clipped.                                                                                                                                                            |

All interactive controls have focus-visible outlines, pressed/hover/disabled states and native semantics. Most high-frequency transitions are 150ms. Buttons press to scale 0.96. Continuous wheel/sleep animations opt into no-preference motion; reduce-motion stops animations and transitions. A Pause control stops illustration loops when the camera is unavailable. Fresh speed controls the day/night state. The sleeping note uses the first future local hour in the 7-day average with at least 100 passes; saved averages over 24 hours old cannot generate a prediction. Optional WebAudio uses square-wave notes, with a four-note win jingle. Sound is off until enabled; it can be toggled in the header or footer.

## Do's and Don'ts

Reuse `CardHead` and the color/type tokens for another section. Keep data grouped with the control it explains. Use actual contract or telemetry values and preserve pending/unknown states. For another page, add a hash navigation entry, compose existing cards, retain one h1 and the global chat launcher, and check both themes at 320/390/1440. Keep home limited to betting. Format amounts and pass counts with en-US commas while leaving dates/times in the visitor’s local timezone.

Keep category colors on pale controls, shadows and result rails; use the foreground token for small result text. Preserve the six-size hierarchy. Keep wallet/transaction implementation details inside meaningful verification, approval or error states. Do not add an external font CDN, fictional activity, unlimited approval, a new wallet relay, a scrolling marquee, or an illustration animation without a static state cue and a motion opt-out.

Design guidance attribution: Better Interface by Jakub Krehel (MIT) and the document method adapted from Paul Bakaus's Impeccable (Apache-2.0), as pinned by this assignment. The combined license is preserved in `docs/frontend/BETTER-INTERFACE-LICENSE.txt`.
