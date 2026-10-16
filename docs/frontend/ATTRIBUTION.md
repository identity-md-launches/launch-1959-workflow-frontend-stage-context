# Frontend sources and attribution

The implementation is derived from the approved Hamster Hour workflow and the deployed source commit `7ab2a01b3d9a15e2acca8b317e77058e6f2d41e9`. Contract behavior and ABI documentation remain in `docs/ABI.md`, `docs/ORACLE.md` and the contract README. Frontend assets and documentation do not alter that implementation.

- Better Interface guidance: Jakub Krehel, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`, MIT; the pinned IMD adaptation includes documentation guidance from Paul Bakaus's Impeccable at `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`, Apache-2.0. The supplied combined license is retained in [BETTER-INTERFACE-LICENSE.txt](BETTER-INTERFACE-LICENSE.txt).
- Contract frontend UX: Austin Griffith / ethskills, commit `06ea4efa08076ff04f6ca4945ef4a2ca881115b0`, MIT. The supplied license is retained in [ETH-FRONTEND-UX-LICENSE.txt](ETH-FRONTEND-UX-LICENSE.txt).
- MetaMask, Rabby and Phantom marks: exact SVG data from `@rainbow-me/rainbowkit` 2.2.11, MIT. The package license is retained in [RAINBOWKIT-LICENSE.txt](RAINBOWKIT-LICENSE.txt). Coinbase's mark follows the pinned connector reference. The package archive was used only in disposable test scratch space and is not part of the submission.
- The wheel/favicon/share graphic and generic browser-wallet symbol are original code-native SVG artwork. `share.png` was rendered from `share.svg` in Chromium, at 1200×630. It is not a live-stream screenshot.
- Wallet integration follows [Wagmi's createConfig documentation](https://wagmi.sh/react/api/createConfig) and the pinned wallet-connectors reference. The actual installed APIs/types were checked for the versions pinned by the lockfile.
- Rabby's current mobile link parser uses `_cmd=open-dapp` and `dapp` beneath `/mobile/`, checked against its [universal-link handler](https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/hooks/universalLink.ts) and [release prefix configuration](https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/constant/universalLink.ts) on 2026-10-16. Launching an installed native app was not tested.

React, Vite, TypeScript, viem, wagmi, TanStack Query, Coinbase Wallet SDK and test-tool dependencies retain their upstream licenses. Exact versions and dependency integrity values are in `web/package-lock.json`; dependencies are installed normally rather than vendored.
