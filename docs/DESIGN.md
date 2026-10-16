# Hamster Hour design

## Overview

Hamster Hour is a mobile-first console for pari-mutuel IMD betting on six rounds of a real hamster wheel. The approved direction is “dark console style … monospace.” The implementation uses a flat dark surface, one lime action color and stable numeric alignment. The stream, clock, line and jackpot lead into the game controls; no marketing hero precedes the product.

This file is under `docs/` because the assignment's explicit write scope forbids root `DESIGN.md`. It records the final source, not a proposed redesign.

## Colors

The canonical values are the CSS custom properties in `web/src/styles.css:1`. The interface is deliberately dark-only; there is no theme toggle.

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#101310` | Page and input background |
| `--surface` | `#181d17` | Stream, dialog, neutral controls |
| `--raised` | `#22291e` | Selected segments and wallet rows |
| `--hover` | `#2d3628` | Neutral interactive hover/press |
| `--line` | `#3b4435` | Structural separators and controls |
| `--text` | `#f0f1e9` | Primary text |
| `--muted` | `#b0b6a9` | Descriptions and secondary data |
| `--accent` | `#c7f06b` | Primary action fill and active selection |
| `--accent-hover` | `#d6fa89` | Primary hover |
| `--on-accent` | `#17200b` | Text on the primary action |
| `--error` | `#ffb1a6` | Error text with explanatory wording |
| `--focus` | `#edfcb9` | Two-pixel keyboard focus outline |

Selection also uses borders, dots and `aria-pressed`; status never relies on color alone. The measured production export passed the probe's text contrast checks. Do not reuse the separator color for text. Wallet marks preserve their original colors.

## Typography

System stack: `SFMono-Regular`, `Consolas`, `Liberation Mono`, `monospace`. There are no font downloads. Actual face selection depends on the visitor's OS; cross-platform rendering is not claimed identical.

Five distinct sizes are used: 13px (`--small`), 15px (`--body`), 16px (`--input`), 20px (`--heading` and `--display`) and 32px (`--title`). The brand title becomes 20px on small screens. Weights are 400, 600 and 700, with the brand as the heaviest. Body line height is 1.5, heading line height 1.3, and the title 1.15. Title tracking is -0.04em, adjusted to -0.035em on mobile; body tracking is natural.

Controls retain 16px input text on phones. Numbers use tabular numerals. Prose is limited to 72ch. Long values wrap; currency suffixes remain intact and do not steal input width. Full addresses remain available in the account panel, copy control or explorer. Monospace prose is an intentional brief override of the probe's default typography preference.

## Layout

`app-shell` is at most 1120px wide, with desktop 28px gutters, 20px below 800px, 16px below 620px and 12px below 359px. Spacing is primarily 4/8/12/16/20/24/28px, with wider gaps of 32/52/80px for desktop sections.

The header wraps when enlarged text needs it. The stream spans the content width. On phones its loaded iframe is 160px high; the unavailable state uses a compact 94px minimum content area. Controls and captions remain ordinary document flow. There is no sticky overlay over the bet.

The overview is a three-column row. Bet and pool explanation use a two-column `work-grid` on desktop and stack below 620px, with the bet first. Claim controls follow the same pattern. Staking stats reduce from four to two columns; history rows reduce from four to two. Wallet dialogs become a full-width bottom sheet below 620px, with safe-area padding.

The primary action is visible at 390×844 in both unavailable and loaded-stream states. Reflow was checked at 320, 390, 768 and 1440 CSS pixels, including long balances and an open account panel. A separate 200% root-text enlargement check at 390 passed; that is not browser-native zoom verification.

## Elevation & Depth

The interface uses tonal surfaces and one-pixel borders. Cards are not nested inside cards, and no surface combines border with shadow. The modal uses the browser's top layer and a black translucent backdrop. Account details use a bounded dropdown; pending-transaction recovery sits in document flow. No background animation, parallax or gradient is used.

## Shapes

Controls and input fields use 6px radii, the segmented group 8px, the desktop wallet dialog 12px and its mobile top corners 16px. The wheel mark is an original local SVG used in the favicon and sharing artwork. The stream container is rectangular, matching the console direction.

## Components

| Component | Source | Use and behavior |
| --- | --- | --- |
| `Action` | `web/src/ui.tsx:8` | Shared connect → switch → action gate, primary/secondary variants, transaction-specific label, disabled prerequisite explanation |
| `Field`, `ErrorNote` | `web/src/ui.tsx` | Persistent labels, adjacent hints and announced errors |
| `Stat`, `AddressLink` | `web/src/ui.tsx` | Consistent readouts; checksummed explorer/copy presentation |
| `WalletProvider`, `WalletControl` | `web/src/Wallet.tsx` | Named wallet discovery, mobile links, native dialog focus containment, Escape/backdrop/close handling, wrong-chain recovery and account menu |
| `TransactionProvider`, `TxFeedback` | `web/src/transactions.tsx` | Per-action simulation, wallet, receipt, confirmation and error states; synchronous duplicate lock; persisted pending-hash recovery |
| `Stream` | `web/src/Stream.tsx` | Current feed only, no autoplay; loading, unavailable, retry and hide/resume states |
| `Bet`, `Claims` | `web/src/Bet.tsx` | Three market selections, exact-amount approval, pool and window reads, claim lookup and optional IMD-only recovery |
| `Stake` | `web/src/Stake.tsx` | Honest unconfigured state or token-specific stake/unstake/reward controls |
| `History`, `Keeper` | `web/src/History.tsx`, `web/src/Keeper.tsx` | Bounded history pages, oracle evidence links, settlement JSON preview and permissionless maintenance |
| `Settings` | `web/src/Settings.tsx` | Public configuration and four TEAM-only timelock pairs |

Native buttons, labels, details and dialog are used. The tablist supports arrow keys, Home and End with roving focus. Focus is a visible 2px outline with 3px offset. The minimum action target is 44px; wallet rows are 52px. Compact utility links are separately spaced. The probe accepted all target sizes under its 24px/spacing rule; some utilities are below its optional 44px recommendation.

Hover changes are limited to devices with hover. Motion is only a 120ms color/background/border transition and slight pressed scale, inside `prefers-reduced-motion: no-preference`. There is no entrance animation or endless animation. Reduced-motion behavior was checked.

## Do's and Don'ts

- Add a game surface using the existing tabs, `work-grid`, `Field`, `Stat` and `Action`; keep the principal control first on mobile.
- Read deployment addresses and ABIs through the shared runtime. Preserve verification and pending-transaction gates when reusing a control.
- Distinguish unavailable data, an unconfigured feature and a confirmed zero balance. Never populate a production screen with test fixtures.
- Keep one filled primary action in a form. Keep ordinary ancillary actions neutral and put detailed instructions beside their controls.
- Preserve the requested console typography; do not add more fonts, small tracked capitals, decorative badges or a marketing hero.
- Rebuild the export and manifest together after any source or asset change. Update this document after a design change.

The consolidated review, actual test coverage, fixed findings and unperformed checks are in `docs/frontend/VALIDATION.md`. Better Interface and ethskills attribution and licenses are retained beside that report.
