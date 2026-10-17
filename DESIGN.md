# Hamster Hour design system

## Overview

A mobile-first betting terminal for a live hamster wheel. The first visit has a full-screen meme-video introduction; after dismissal, the player (live YouTube embed or the SLEEPING screen), countdown, line and three betting choices are the main interface, with the wallet-signed Wheel chat beneath them. The desktop version places the game controls and chat beside the player and adds an original pixel hamster running in a wheel. More contains the secondary contract tools. A meme layer (poke, mood, result cards, easter eggs) sits on top without changing the game.

The visual idea is a dark grid terminal lit by neon green, with one orange-and-cream goggle hamster. This document describes `web/src/` and the shipped `dist/`, not the earlier frontend. The deployed contracts and economics are unchanged.

## Colors

Canonical tokens live in `web/src/styles.css`.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#0b0d0b` | Page, inputs and dialogs |
| `--surface` | `#101710` | Neutral controls, notices, menus |
| `--raised` | `#142116` | Hover and selected menu surfaces |
| `--line` | `#163a1c` | Structural dividers; 25px SVG grid at 25% opacity |
| `--green` | `#39ff6a` | Actions, ring art, pool numbers, countdown and selected chips |
| `--text` | `#f2f0e6` | Headings, body and focus outline |
| `--dim` | `#5a8f63` | The coming-soon line and footer text on the page background |
| `--muted` | `#85aa8b` | Readable supporting labels and body text across surfaces |
| `--danger` | `#ffae9c` | Errors, always accompanied by explanatory text |
| `--glow` | `0 0 18px #39ff6a26` | Interactive neon glow |

Computed solid-token contrast against `--bg`: foreground text 17.07:1, accent 14.57:1, dim 5.15:1, muted 7.54:1 and error 10.95:1. These are calculated token pairs, not a claim that video frames were measured. `--dim` is not used for text on `--raised`, where its calculated 4.40:1 would be too low. The rendered accessibility scan and probe also checked eligible text; image/grid-dependent backgrounds and cross-origin YouTube content have stated limitations in validation.

Pixel-art oranges and creams are local illustration colors, not additional interface status colors. Wallet marks retain their official brand colors. The design is intentionally dark-only.

Buttons: `.primary` is a dark fill (`--bg`) with a 1px `--green` border and bold green text; hover adds `--glow` and a faint inset glow. `.secondary` uses `--dim` text and border. Selected amount chips use `--raised` with an inset green ring. The LIVE badge is green on near-black with a text glow; SLEEPING uses `--dim`. Chat identicons use `hsl(hue 75% 62%)` derived from the address, decorative only. Confetti seeds are `#2a2420` / `#f2e2b7`.

## Typography

IBM Plex Mono is bundled as regular 400 and bold 700 Latin WOFF2 in `web/src/assets/`. The fallback is `monospace`. `font-display: swap` and `font-synthesis: none` are set; both used weights are supplied. There is no external font request from the app.

The six sizes are 12, 14, 16, 20, 32 and 48px (`--s1` through `--s6`). Supporting labels are 12px; body is 14px; inputs and tertiary headings are 16px; section headings and primary choices are 20px; desktop hero/line values are 32px; countdown/desktop intro title are 48px. The mobile intro title is 32px and the header name is 14px. At 320px the compact header and SLEEPING label use 12px to fit without clipping.

Body line height is 1.6, headings 1.25 and countdown 1.2. Headings balance their lines. Changing digits use tabular numerals; the face itself is monospaced. The uppercase brand is bold with small display tracking; body copy has natural spacing. The countdown uses -0.04em and the desktop hero -0.035em tracking. Long numbers, addresses and URLs generally wrap rather than being clipped. The amount suffix is `white-space: nowrap`, at least `3ch` wide and cannot flex-shrink; its adjacent input uses `flex: 1 1 0` and `min-width: 0`. The live-progress summary stays on a single horizontally scrollable line at 900px and below so the full values remain reachable. Technical addresses remain available in full through the account menu and copy/explorer controls.

`SlotNumber` shares `--slot-row-height: 1.2em` between its viewport, each digit row and its translation. A value's visible digits therefore align with its accessible label at every font size, including after updates and with reduced motion.

## Layout

`app-shell` has a 1248px maximum width and 24px inline gutters, reduced to 20px at 900px, 16px at 600px and 12px at 350px. Spacing follows 4/8/12/16/20/24/32/40px steps. The grid extends across the whole page using an SVG pattern rather than a gradient.

Above 900px, `play-layout` has 1.65fr and 1fr columns separated by 32px; above 1100px the gap becomes 40px. The right column holds the betting panel, How it works and the Wheel chat (280px scrolling log). At 900px and below it becomes one column and the decorative wheel hero is hidden. The `.player` slot is exactly 16:9 whether it holds the YouTube iframe or the absolutely positioned SLEEPING screen; the badge sits in its top-left corner and the 3 s "HE'S RUNNING" banner is centred low. The poke row sits directly under the player.

On phones, the reading order is header (brand + mood), Bet/More utilities, player, poke row, countdown/line with the passes tooltip, the window line, live progress, three buttons, short explanation, exact-guess link, How it works, Wheel chat (240px log) and personal bets. The three main choices remain one row. No marketing content appears before the game. The main choices remain in the first 390×844 viewport after the intro is dismissed, including the live progress block (browser assertion and screenshot in the maintenance check).

The secondary pages are at most 900px wide. `work-grid` and personal positions use two columns on wide screens and one on phones. History and settings wrap long data. Personal-position grid items have `min-width: 0` to contain the new live summary. Wallet and amount dialogs become full-width bottom sheets below 600px, with safe-area bottom padding and a scrollable maximum height of 92dvh.

## Elevation & Depth

The interface uses dark fills, one-pixel separators and square borders. Neon glow is reserved for the specified rings, countdown, pool values, hover and intro frame. The intro frame intentionally combines a green border and glow. There are no gradients, stock illustrations, background animation or decorative photos; the requested intro video and live stream are the media exceptions.

Native modal dialogs use the browser top layer, a dark translucent backdrop and 4px backdrop blur. Their background is inert while open. Account and More popovers use small z-index layers; ordinary content and pending-transaction notices stay in flow.

## Shapes

Controls have zero border radius. The mascot’s circular neon ring and stepped pixel goggles are art, not rounded UI containers. The front-view hamster has orange fur, cream cheeks and round pixel goggles. `favicon.svg` is the default face; `hamster-happy.svg` smiles; `hamster-asleep.svg` closes its eyes; `hamster-curled.svg` is the curled-up sleeper on the SLEEPING screen; `hamster-thumbs.svg` gives the thumbs up on a winning card. `hamster-wheel.svg` is the desktop runner. Sunglasses are two black CSS pixels overlaid on the logo after ten clicks. `share.svg` and its 1200×630 PNG include the mascot.

## Components

| Component | Source | Behavior |
| --- | --- | --- |
| `Intro` | `web/src/Intro.tsx` | Full-screen local video; Start playing, Escape, close and backdrop dismissal; one-time localStorage memory; pause control and reduced-motion start state |
| `Stream` | `web/src/Stream.tsx`, `live.ts` | `/live` every 20 s through the proxy: live YouTube embed (switches on publicId change), SLEEPING screen (curled mascot, zzz, last known mm/s and passes from `/status`), fallback embed of the last known stream when the proxy fails, including after a cached idle response; successful polls restore the current state; LIVE/SLEEPING badge; one-time green pulse and banner on going live |
| `Chat` / `Identicon` | `web/src/Chat.tsx` | 5 s polling log (200 kept, autoscroll unless scrolled up), EIP-191 signed posts, 200-char/no-link/5 s client rules, plain-word server errors, address + pixel identicon + "bet" tag, read-only with "Connect to chat" |
| Meme layer | `web/src/meme.tsx`, `App.tsx`, `Bet.tsx`, `MyBets.tsx` | Poke button with synthesized squeak, hop and local counter; header mood; `SlotNumber` digit reels; `SeedConfetti`; winning/losing result cards with share intents; logo-click sunglasses; Konami spin; page dim while sleeping |
| `Bet` / `Sheet` | `web/src/Bet.tsx`, `Sheet.tsx` | Three primary choices; secondary EXACT/RUNNING; first-visit expanded How it works with persisted disclosure choice; jackpot copy shown only when the on-chain token is configured; amount chips and custom input; checking/approval/placing/success/error states; exact-amount approval followed by one bet |
| `WindowProgress` | `web/src/WindowProgress.tsx`, `live.ts` | Current on-chain window times, six-round mapping from Squeekchain’s independent epoch, worker settlement baseline and live counter; exact/approximate/round-only fallbacks; 3px green progress bar capped at 100%, labelled progressbar and a keyboard-scrollable summary region; muted unofficial-oracle note; no animation |
| `MyBets` / `ResultCard` | `web/src/MyBets.tsx` | Current/next positions, live progress beside a bet on the running window, pending results, real outcome and payout, one Claim, optional separate jackpot transfer |
| `Action`, `Field`, `ErrorNote` | `web/src/ui.tsx` | Shared connect/switch/action gate, persistent input labels, disabled reasons and announced feedback |
| `WalletProvider` / `WalletControl` | `web/src/Wallet.tsx` | Named extension discovery and legacy injected wallets connect directly when exactly one is detected; the generic duplicate is omitted when discovery names providers; multiple/no wallets retain the native picker, phone links and Coinbase Smart Wallet; network switch and account menu |
| `TransactionProvider` | `web/src/transactions.tsx` | Simulation, wallet review, confirmation, replacement tracking and unresolved-receipt recovery |
| `OraclePurchase` / `Keeper` | `web/src/OraclePurchase.tsx`, `Keeper.tsx` | Reviewable paid oracle request, polling/persistence, verified prefill, manual paste, settlement, timeout and reserve funding |
| `Settings` | `web/src/Settings.tsx` | Everyone sees current/pending values and dates; only TEAM gets editable inputs and actions |
| `Stake` / `History` | `web/src/Stake.tsx`, `History.tsx` | Existing staking actions and public history, including manual lookup and claims |

Most actions are at least 44px high; wallet rows are at least 52px. Compact utility links and the video control retain sufficient size/spacing. Focus is a 2px off-white outline with 4px offset. Controls have hover, press, disabled and focus-visible states; selection also has `aria-pressed`. The native dialogs contain focus and restore it on dismissal. During the approval/bet flow, closing its sheet is disabled so the transaction state remains visible.

UI transitions are 120ms on named properties; pressed buttons scale to 0.96. Motion in the meme layer: zzz drift (3.6s loop, only while sleeping), 480ms hop, 700ms digit reels, 1.2s green pulse, 1.3s page spin, falling seeds on a winning card. `prefers-reduced-motion` removes every animation and transition, renders zzz static, hides the seeds, cancels the spin and stops the chewing video from autoplaying. The external YouTube player controls its own video behavior. The tooltip under the line opens on hover, focus or tap of its 24px "?" control.

The live progress block reuses `--s1` (12px), `--muted` and existing body text; tabular numerals; `--line` for the 3px track and `--green` for its fill; 8px from summary to bar and 8px to the small print, with 12px below the block. At desktop widths its text can wrap within the panel. At 900px and below the summary scrolls horizontally as one line, the bar fits the available width, and the small print wraps naturally. This does not add a type size, color, shadow, animation or dependency. Its settlement-based baseline is separate from the pre-existing mood counter. Missing or failed worker data shows only the round, with no invented zero.

The header mood uses speed for sleeping, stretching, cruising and zoomies. With nonzero speed, villain era requires tracked current-window passes strictly above twice the line. This existing local observation counter starts at the first status sample seen in the window; it is not the oracle's settled result.

## Do’s and don’ts

- Build a new secondary surface from `.secondary-page`, `.section`, `Field` and `Action`; add it to More without pushing the Bet controls downward.
- Use the existing six sizes, two weights and semantic color roles. Keep important long values readable and allow wrapping.
- Keep pools, balances, timing, results and configuration derived from chain reads. A missing value is a loading/error state, not a zero.
- Use plain player words: shared pool, verified result, refunded and close the window. Precise protocol vocabulary belongs in How it works, Settle, TEAM and documentation.
- Reuse the transaction and wallet gates. Never add a separate private signer, fake provider, relay dependency or alternate deployment.
- Regenerate the full static export and manifest after a source/asset change. Keep the local video, fonts and license with it.

The latest six-domain review, probe exceptions, interaction evidence and unperformed checks are in the [maintenance report](docs/frontend/MAINTENANCE.md); the [revision report](docs/frontend/REVISION.md) is retained for historical changes, with the [original validation record](docs/frontend/VALIDATION.md) retained. Guidance attribution and licenses are retained in [docs/frontend/ATTRIBUTION.md](docs/frontend/ATTRIBUTION.md).
