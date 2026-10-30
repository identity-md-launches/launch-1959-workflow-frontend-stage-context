import { parseAbi } from "viem";

// First code-bearing block, found by eth_getCode binary search on Ethereum.
// Block 26,229,404 has no code; block 26,229,405 has the deployed runtime.
// The address itself continues to come from the verified runtime handoff.
export const LEADERBOARD_DEPLOYMENT_BLOCK = 26_229_405n;
export const LEADERBOARD_REWARD_TEXT: string =
  "Top 5 by volume get a WL for the @squeekchain NFT mint";
// Explicit team exclusion supplied for the leaderboard; never used for transactions.
export const LEADERBOARD_TEAM = "0x6cba4751742f6989fa224b2dc5d5d52fcef98a34";
export const LEADERBOARD_CACHE_VERSION = "v2-played-ticket-5-imd";
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
  "event Settled(uint256 indexed k, uint256 result, bytes32 indexed requestId, address indexed settler)",
  "event MarketVoided(uint256 indexed k, uint8 indexed market)",
  "event TimedOut(uint256 indexed k)",
]);
