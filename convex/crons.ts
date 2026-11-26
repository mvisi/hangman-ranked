import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Drop players who closed the tab while searching for a match.
crons.interval("purge stale matchmaking entries", { seconds: 30 }, internal.ranked.purgeStaleQueue);

// Safety nets in case a scheduled turn timer was lost.
crons.interval("resolve expired ranked matches", { minutes: 1 }, internal.ranked.sweepExpiredMatches);
crons.interval("expire idle solo games", { minutes: 5 }, internal.game.sweepIdleGames);

export default crons;
