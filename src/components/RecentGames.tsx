"use client";

import { useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { DELETED_USER_NAME } from "../../convex/lib/username";
import Container, { SectionTitle } from "./Container";
import { ResultBadge } from "./stats/ResultBadge";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { cn, formatDuration, formatRelative, formatSigned, profileHref } from "@/lib/utils";

export type RankedGameRow = NonNullable<
  FunctionReturnType<typeof api.user.getRecentRankedGames>
>[number];

export function PlayerLink({ name, className }: { name: string; className?: string }) {
  if (name === DELETED_USER_NAME) {
    return <span className="text-muted-foreground italic">deleted user</span>;
  }
  return (
    <Link
      href={profileHref(name)}
      className={cn("font-medium underline-offset-4 hover:underline", className)}
    >
      {name}
    </Link>
  );
}

export const RecentSoloGames = () => {
  const games = useQuery(api.user.getRecentSoloGames);

  if (games === undefined) {
    return (
      <Container>
        <Skeleton className="h-48 w-full" />
      </Container>
    );
  }
  if (!games || games.length === 0) return null;

  return (
    <Container>
      <SectionTitle title="Recent games" description="Your last few solo rounds." />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Result</TableHead>
            <TableHead>Word</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Guesses</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Misses</TableHead>
            <TableHead className="text-right">Time</TableHead>
            <TableHead className="hidden text-right md:table-cell">When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {games.map((game) => (
            <TableRow key={game._id}>
              <TableCell>
                <ResultBadge result={game.result} />
              </TableCell>
              <TableCell className="font-mono font-medium uppercase">{game.word}</TableCell>
              <TableCell className="tabular text-right font-semibold">{game.score}</TableCell>
              <TableCell className="tabular hidden text-right sm:table-cell">{game.attempts}</TableCell>
              <TableCell className="tabular hidden text-right sm:table-cell">{game.mistakes}</TableCell>
              <TableCell className="tabular text-right">{formatDuration(game.durationMs)}</TableCell>
              <TableCell className="text-muted-foreground hidden text-right md:table-cell">
                {formatRelative(game.endedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Container>
  );
};

/** The signed-in player's latest ranked matches (ranked page). */
export const RecentRankedGames = () => {
  const games = useQuery(api.user.getRecentRankedGames, { limit: 10 });
  if (games === undefined) {
    return (
      <Container>
        <Skeleton className="h-48 w-full" />
      </Container>
    );
  }
  if (!games || games.length === 0) return null;
  return <RankedGamesTable games={games} title="Recent matches" />;
};

export const RankedGamesTable = ({
  games,
  title,
  description,
  pageSize,
}: {
  games: RankedGameRow[];
  title: string;
  description?: string;
  /** Paginate client-side with this many rows per page. */
  pageSize?: number;
}) => {
  const [page, setPage] = useState(0);
  const totalPages = pageSize ? Math.max(1, Math.ceil(games.length / pageSize)) : 1;
  const currentPage = Math.min(page, totalPages - 1);
  const rows = pageSize
    ? games.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
    : games;

  return (
    <Container>
      <SectionTitle title={title} description={description} />
      {games.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">No ranked matches yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Result</TableHead>
              <TableHead>Opponent</TableHead>
              <TableHead className="hidden sm:table-cell">Word</TableHead>
              <TableHead className="text-right">Elo</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Misses</TableHead>
              <TableHead className="hidden text-right md:table-cell">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((game) => (
              <TableRow key={game._id}>
                <TableCell>
                  <ResultBadge result={game.won ? "won" : "lost"} reason={game.endReason} />
                </TableCell>
                <TableCell className="max-w-40 truncate">
                  <PlayerLink name={game.opponent} />
                  <span className="text-muted-foreground tabular ml-1.5 hidden text-xs lg:inline">
                    {game.opponentElo}
                  </span>
                </TableCell>
                <TableCell className="hidden font-mono font-medium uppercase sm:table-cell">
                  {game.word}
                </TableCell>
                <TableCell
                  className={cn(
                    "tabular text-right font-semibold",
                    game.eloChange > 0 && "text-success",
                    game.eloChange < 0 && "text-danger",
                  )}
                >
                  {formatSigned(game.eloChange)}
                </TableCell>
                <TableCell className="tabular hidden text-right sm:table-cell">{game.mistakes}</TableCell>
                <TableCell className="text-muted-foreground hidden text-right md:table-cell">
                  {formatRelative(game.endTime)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {pageSize && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={currentPage === 0}
            onClick={() => setPage(Math.max(0, currentPage - 1))}
            aria-label="Previous page"
          >
            <ChevronLeftIcon />
          </Button>
          <span className="tabular text-muted-foreground">
            Page {currentPage + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={currentPage >= totalPages - 1}
            onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))}
            aria-label="Next page"
          >
            <ChevronRightIcon />
          </Button>
        </div>
      )}
    </Container>
  );
};
