// Immutable rules checked against deployed runtime and source. Evidence and exact
// source locations: docs/frontend/HOW-TO-PLAY-SOURCES.md. No transaction code uses this file.
export const PLAY_RULES = {
  genesis: 1791847200n,
  windowSeconds: 3600n,
  rounds: 6,
  roundMinutes: 10,
  openAheadSeconds: 86400n,
  timeoutHours: 48,
  minBet: "0.5",
  ticketPrice: "5",
  maxTickets: 256,
  snoozeThreshold: 100,
  toleranceDivisor: 200,
  binary: { stakers: 5, jackpot: 2, oracle: 1, team: 1, winners: 91 },
  ticket: { stakers: 5, jackpot: 93, oracle: 1, team: 1 },
  jackpotPayout: 80,
  halfLoss: 18750,
  initialMiningRate: 20000,
  warmupHours: 24,
  unstakeHours: 24,
  vestingDays: 7,
  hookStreamDays: 7,
  gameStreamDays: 30,
  swapStakersPercent: "0.5",
} as const;

export const RULE_SOURCES = {
  game: "https://github.com/identity-md-launches/launch-2260-build-hamster-hour-v2/blob/49f53ca0f278fe4edf6431f68a51468552372af7/src/HamsterHour.sol",
  vault:
    "https://github.com/identity-md-launches/launch-2304-project-site-https-hamsterhour-fun-launc/tree/69ca386ed1d5ea7529caf7b75c348159bf488885/src",
  hook: "https://github.com/identity-md-launches/launch-2336-hamster-hour/blob/bf12d716b9268cbe820ee776be2a990b4f2c09bd/src/HamsterHook.sol",
  token:
    "https://github.com/identity-md-launches/launch-2336-hamster-hour/blob/bf12d716b9268cbe820ee776be2a990b4f2c09bd/src/HamsterToken.sol",
};

export const utcDate = (seconds: bigint) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(new Date(Number(seconds) * 1000)) + " UTC";

export const utcTime = (seconds: bigint) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(new Date(Number(seconds) * 1000));
