# Hamster Hour design

## Overview

Hamster Hour is a single-page React game for people betting IMD on a real hamster's next hour. The implemented direction is “cozy pixel”: warm paper, a large tight headline ending in a peach period, an original geometric hamster/cage/wheel, rounded cards and small pixel counters. The illustration is original SVG in `web/src/pixel.tsx`, not a character from another property. The three pages share a header, footer and runtime data: The wheel, Stats and My bets. The worker extension is a separate deployment handoff; it preserves the existing camera/chat endpoint behavior, including chat preflight, and is not a static runtime dependency bundle.

The source of truth is `web/src/styles.css`, with component composition in `App.tsx`, `Bet.tsx`, `Jackpot.tsx`, `Stats.tsx` and `MyBets.tsx`. `DESIGN.md` describes the final implemented system; validation and observed limitations are in `docs/frontend/V2-VALIDATION.md`.

## Colors

All page colors use CSS properties, switched by the root `data-theme` attribute. Automatic mode follows fresh positive wheel speed; a visitor can select day/night manually or restore Auto theme in the footer.

| Role/token        | Day       | Night / use                             |
| ----------------- | --------- | --------------------------------------- |
| `--bg`            | `#FFF5E6` | `#1E1A2E`                               |
| `--card`          | `#FFFBF4` | `#29233D`                               |
| `--ink`           | `#2B2118` | `#FFF5E6`                               |
| `--muted`         | `#796451` | `#BEAFCF`                               |
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

## Typography

Two local families, four WOFF2 files in `web/src/assets/`:

- Geist regular 400, semibold 600 and bold 700 for interface text, headings and body copy; fallback Arial/sans-serif.
- Silkscreen regular 400 for the big pass count, line, jackpot, category tags and headline statistics; fallback monospace.

Six size tokens: `--small` 12px, `--label` 14px, `--body` 16px, `--heading` 20px, `--number` 40px, `--display` 82px. Display becomes 88px at 1440+, 62px at 1100 and below, 48px at 800 and below, and 40px below 360. Numeric labels use tabular figures. Silkscreen is never used for paragraphs. Body line-height is 1.5; the main headline is 1.02, or 1 on mobile, with -0.065em tracking. Section headings use -0.025em. Controls use native labels and no tracked uppercase eyebrow.

The mobile amount, chat and modal inputs are at least 16px; the main amount is 20px. Mobile native selects are 16px. The word IMD is a separate nonwrapping flex item. Font licenses are shipped in `dist/fonts/`.

## Layout

`.site` is centered, normally at most 1280px including 40px side padding. At 1440+ it is at most 1340px with 50px padding; padding falls to 28px, 22px, then 16px as space narrows. Most layout gaps are 24px, then 20/18px on smaller screens; component gaps use 4, 8, 10, 12 and 16px.

At desktop, the habitat and activity strip occupy the leading column; the betting form occupies the trailing column. The main and lower grids use `1.4fr / 1fr` with a minimum 350px betting column. The lower pair is camera/jackpot. Chat/My bets form another pair. Stats uses a full-width chart, two detail cards and a four-column event summary.

Breakpoints are 1440, 1100, 800, 680 and 359px. At 680 and below, betting comes first in the content order, then the habitat and activity. The headline and three choices remain on the opening screen at 390px. A fixed bottom summary/action bar reserves an 82px plus safe-area region: the page scrolls inside `.site` above it, so the action does not cover text. Other tabs return to ordinary document scrolling. Chat uses native collapsible details; results and activity feeds expose horizontal scrolling. Results and chat are keyboard-focusable scroll regions. The header's tabs wrap onto their own row. Dialogs become full-width bottom sheets with safe-area padding.

Screens inspected at 320, 390, 800 and 1440 CSS pixels. Mobile browser emulation is not a physical-device or native 200% zoom test.

## Elevation & Depth

Cards use a 1px warm border and no shadow. A very low-opacity fixed SVG turbulence overlay supplies film grain and ignores pointer events. The habitat has a faint square grid. Activity plots and the share card add small dotted/grid touches.

The requested chunky action treatment is intentional: main buttons use a 4px downward colored shadow plus a 1px dark border. Category buttons have corresponding shadows. This is a documented exception to the probe's generic “border and shadow together” preference. Help popovers and account menus are elevated; dialogs use the native top layer, a dark translucent backdrop and 4px backdrop blur. The mobile action bar is z-index 40, errors 80, and skip navigation 100.

## Shapes

Cards and dialogs have 26px outer corners, within the requested 22–28px range. Buttons and navigation pills use 99px radii. Category choices and video frames use 16px; fields use 12–14px; graph bars use 4–5px. The pixel illustration deliberately uses stepped hard corners and `shape-rendering: crispEdges` instead of rounded illustration geometry.

## Components

| Component / source                               | Use and behavior                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CardHead`, `Help` · `ui.tsx`                    | Consistent heading/action alignment. The question mark is native details/summary, usable with keyboard and pointer. Text stays readable in both themes.                                                                                                                                                |
| `BetPanel` · `Bet.tsx`                           | Local-time hour, large line, three category buttons, independent SNOOZE yes/no, live return estimate, amount/quick picks, approval step, review dialog, timeline and mobile action bar. Inline failures preserve input. A review freezes account/hour/side/amount and rechecks closing before sending. |
| `WalletProvider`, `WalletControl` · `Wallet.tsx` | EIP-6963 extensions, mobile wallet links, Coinbase passkey wallet, switch-chain and account menu. Native dialog closes with Escape/backdrop/close button and restores focus.                                                                                                                           |
| `Sheet` · `Sheet.tsx`                            | Native modal shared by review, ticket, feed and share. Focus stays inside; closing restores the trigger. Pending transactions prevent accidental dismissal.                                                                                                                                            |
| `TransactionProvider` · `transactions.tsx`       | Verification → simulation → wallet → receipt. Visible pending/failure/success text and explorer link; duplicate sends are locked while a transaction is pending.                                                                                                                                       |
| `Hamster`, `Seed`, `Jar` · `pixel.tsx`           | Original code-native illustration. Fresh speed switches sleep/run and wheel movement. Six telemetry seeds and the decorative coin jar accompany readable numeric values. Unknown readings remain unknown.                                                                                              |
| `Activity`, `Stats` · `Stats.tsx`                | Local-hour telemetry chart, now marker, 7/30-day filters, records and event statistics. Charts have contrasting edges and accessible text. Saved data is dated and identified.                                                                                                                         |
| `MyBets` · `MyBets.tsx`                          | Wallet-specific positions, claimable IMD, per-hour claim and sequential Claim all. New wins show a banner and optional jingle/confetti. Empty and failed reads have explicit states.                                                                                                                   |
| `Stream`, `Chat` · corresponding files           | Existing cam and signed chat protocols. Video has pause/play; reduced-motion starts it paused. Chat scroll can be inspected independently and collapses on phones.                                                                                                                                     |
| `Share` · `Share.tsx`                            | Locally rendered PNG with exact side, amount, line and local time, download and X intent. Text is fitted to the canvas rather than clipped.                                                                                                                                                            |

All interactive controls have focus-visible outlines, pressed/hover/disabled states and native semantics. Most high-frequency transitions are 150ms. Buttons press to scale 0.96. Continuous wheel/sleep animations opt into no-preference motion; reduce-motion stops animations and transitions. A separate Pause control stops illustration loops. Optional WebAudio uses square-wave notes, with a four-note win jingle. Sound is off until enabled; it can be toggled in the header or footer.

## Do's and Don'ts

Reuse `CardHead` and the color/type tokens for another section. Keep data grouped with the control it explains. Use actual contract or telemetry values and preserve pending/unknown states. For a new page, add a hash navigation entry, compose existing cards, retain one h1, and check both themes at 320/390/1440.

Keep category colors on pale controls, shadows and result rails; use the foreground token for small result text. Preserve the six-size hierarchy. Keep wallet/transaction implementation details inside meaningful verification, approval or error states. Do not add an external font CDN, fictional activity, unlimited approval, a new wallet relay, a scrolling marquee, or an illustration animation without a static state cue and a motion opt-out.

Design guidance attribution: Better Interface by Jakub Krehel (MIT) and the document method adapted from Paul Bakaus's Impeccable (Apache-2.0), as pinned by this assignment. The combined license is preserved in `docs/frontend/BETTER-INTERFACE-LICENSE.txt`.
