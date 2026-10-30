import { parseAbi } from "viem";

// First code-bearing block, found by eth_getCode binary search on Ethereum.
// Block 26,229,404 has no code; block 26,229,405 has the deployed runtime.
// The address itself continues to come from the verified runtime handoff.
export const LEADERBOARD_DEPLOYMENT_BLOCK = 26_229_405n;
export const LEADERBOARD_REWARD_TEXT: string = "";
export const LEADERBOARD_TICKET_PRICE = 5n * 10n ** 18n;
export const LEADERBOARD_PAGE_SIZE = 10;
export const LEADERBOARD_LIMIT = 50;
export const LEADERBOARD_REFRESH_MS = 60_000;
export const LEADERBOARD_RPCS = [
  "https://ethereum.public.blockpi.network/v1/rpc/public",
  "https://rpc.mevblocker.io",
  "https://ethereum-rpc.publicnode.com",
  "https://eth.llamarpc.com",
  "https://eth.drpc.org",
  "https://cloudflare-eth.com",
] as const;
export const LEADERBOARD_EVENTS = parseAbi([
  "event BinaryBet(uint256 indexed k, address indexed bettor, uint8 indexed market, bool side, uint256 amount)",
  "event TicketBought(uint256 indexed k, address indexed bettor, uint256 guess)",
]);
