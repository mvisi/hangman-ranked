import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { MedalIcon, TrophyIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { api } from "../../../../convex/_generated/api";
import { PLACEMENT_MATCHES } from "../../../../convex/lib/elo";
import { Page, PageHeader } from "@/components/Container";
import { PlayerLink } from "@/components/RecentGames";
import { RankBadge } from "@/components/stats/RankBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatDuration, formatPercent, formatRelative } from "@/lib/utils";

export const metadata: Metadata = { title: "Leaderboard" };

const BOARDS = {
  score: { label: "High scores", description: "The top 100 players by their highest-scoring solo game." },
  fastest: { label: "Fastest solves", description: "The top 100 players by their quickest solo win." },
  elo: {
    label: "Ranked",
    description: `The top 100 placed players by Elo rating (${PLACEMENT_MATCHES} ranked matches required).`,
  },
} as const;
type Board = keyof typeof BOARDS;

const LeaderboardPage = async ({ searchParams }: PageProps<"/leaderboard">) => {
  const { board: rawBoard } = await searchParams;
  const board: Board = rawBoard === "elo" || rawBoard === "fastest" ? rawBoard : "score";

  const token = await convexAuthNextjsToken();
  const me = token
    ? await fetchQuery(api.auth.loggedInUser, {}, { token }).catch(() => null)
    : null;

  const remainingPlacement =
    board === "elo" && me && me.ranked.games < PLACEMENT_MATCHES
      ? PLACEMENT_MATCHES - me.ranked.games
      : 0;

  return (
    <Page>
      <PageHeader
        eyebrow="Leaderboard"
        title="Hall of fame"
        description={BOARDS[board].description}
      />
      <nav aria-label="Leaderboards" className="bg-muted mt-6 inline-flex rounded-xl p-1">
        {(Object.keys(BOARDS) as Board[]).map((key) => (
          <Link
            key={key}
            href={key === "score" ? "/leaderboard" : `/leaderboard?board=${key}`}
            aria-current={board === key ? "page" : undefined}
            scroll={false}
            className={cn(
              "text-muted-foreground hover:text-foreground rounded-lg px-3 py-1.5 text-sm font-medium transition-colors sm:px-4",
              board === key && "bg-card text-foreground shadow-sm",
            )}
          >
            {BOARDS[key].label}
          </Link>
        ))}
      </nav>
      {remainingPlacement > 0 && me && (
        <div className="bg-card mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-5 py-3 text-sm shadow-sm">
          <p className="text-muted-foreground">
            Placement progress:{" "}
            <span className="text-foreground tabular font-semibold">
              {me.ranked.games}/{PLACEMENT_MATCHES}
            </span>{" "}
            — play {remainingPlacement} more {remainingPlacement === 1 ? "match" : "matches"} to
            appear here.
          </p>
          <Link href="/ranked" className="text-primary font-medium hover:underline">
            Play ranked →
          </Link>
        </div>
      )}
      <div className="bg-card mt-4 overflow-hidden rounded-2xl border shadow-sm">
        {board === "elo" ? (
          <EloBoard myName={me?.name} />
        ) : (
          <SoloBoard sort={board === "fastest" ? "time" : "score"} myName={me?.name} />
        )}
      </div>
    </Page>
  );
};

function RankCell({ rank }: { rank: number }) {
  const medal = ["text-amber-500", "text-zinc-400", "text-orange-700 dark:text-orange-400"][rank - 1];
  return (
    <TableCell className="tabular w-14 pl-5 font-semibold">
      {medal ? (
        <span className="flex items-center gap-1" aria-label={`Rank ${rank}`}>
          <MedalIcon className={cn("size-5", medal)} />
          <span className="sr-only">{rank}</span>
        </span>
      ) : (
        <span className="text-muted-foreground">{rank}</span>
      )}
    </TableCell>
  );
}

function Player({ name, image }: { name: string; image?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar className="size-7">
        <AvatarImage src={image} alt="" />
        <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <PlayerLink name={name} className="truncate" />
    </span>
  );
}

function EmptyBoard({ text }: { text: string }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-center text-sm">
      <TrophyIcon className="size-8 opacity-40" />
      {text}
    </div>
  );
}

async function EloBoard({ myName }: { myName?: string }) {
  const players = await fetchQuery(api.leaderboard.getEloLeaderboard, {});
  if (players.length === 0) {
    return (
      <EmptyBoard
        text={`No placed players yet. Complete ${PLACEMENT_MATCHES} ranked matches to qualify!`}
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/50">
          <TableHead className="pl-5">#</TableHead>
          <TableHead>Player</TableHead>
          <TableHead className="hidden sm:table-cell">Tier</TableHead>
          <TableHead className="text-right">Elo</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Matches</TableHead>
          <TableHead className="text-right">Win %</TableHead>
          <TableHead className="hidden pr-5 text-right md:table-cell">Last seen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {players.map((p) => (
          <TableRow key={p._id} className={cn(p.user === myName && "bg-accent/60 hover:bg-accent")}>
            <RankCell rank={p.rank} />
            <TableCell className="max-w-48">
              <Player name={p.user} image={p.image} />
            </TableCell>
            <TableCell className="hidden sm:table-cell">
              <RankBadge elo={p.elo} className="px-2 py-0.5 text-xs" />
            </TableCell>
            <TableCell className="tabular text-right font-bold">{p.elo}</TableCell>
            <TableCell className="tabular hidden text-right sm:table-cell">{p.games}</TableCell>
            <TableCell className="tabular text-right">{formatPercent(p.winPct)}</TableCell>
            <TableCell className="text-muted-foreground hidden pr-5 text-right md:table-cell">
              {formatRelative(p.lastSeen)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

async function SoloBoard({ sort, myName }: { sort: "score" | "time"; myName?: string }) {
  const games = await fetchQuery(api.leaderboard.getSoloLeaderboard, { sort });
  if (games.length === 0) return <EmptyBoard text="No solo games won yet. Be the first!" />;

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/50">
          <TableHead className="pl-5">#</TableHead>
          <TableHead>Player</TableHead>
          <TableHead className={cn("text-right", sort === "time" && "hidden sm:table-cell")}>Score</TableHead>
          <TableHead className="hidden sm:table-cell">Word</TableHead>
          <TableHead className="hidden text-right md:table-cell">Guesses</TableHead>
          <TableHead className="hidden text-right md:table-cell">Misses</TableHead>
          <TableHead className={cn("pr-5 text-right", sort === "score" && "hidden sm:table-cell")}>Time</TableHead>
          <TableHead className="hidden pr-5 text-right lg:table-cell">Played</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {games.map((g) => (
          <TableRow key={g._id} className={cn(g.user === myName && "bg-accent/60 hover:bg-accent")}>
            <RankCell rank={g.rank} />
            <TableCell className="max-w-48">
              <Player name={g.user} image={g.image} />
            </TableCell>
            <TableCell
              className={cn(
                "tabular text-right",
                sort === "score" ? "font-bold" : "hidden sm:table-cell",
              )}
            >
              {g.score}
            </TableCell>
            <TableCell className="hidden font-mono font-medium uppercase sm:table-cell">{g.word}</TableCell>
            <TableCell className="tabular hidden text-right md:table-cell">{g.attempts}</TableCell>
            <TableCell className="tabular hidden text-right md:table-cell">{g.mistakes}</TableCell>
            <TableCell
              className={cn(
                "tabular pr-5 text-right",
                sort === "time" ? "font-bold" : "hidden sm:table-cell",
              )}
            >
              {formatDuration(g.time)}
            </TableCell>
            <TableCell className="text-muted-foreground hidden pr-5 text-right lg:table-cell">
              {formatRelative(g.playedAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default LeaderboardPage;
