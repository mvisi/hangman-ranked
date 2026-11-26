import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { LogInIcon, SwordsIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { api } from "../../../../convex/_generated/api";
import { getRankTier } from "../../../../convex/lib/elo";
import Container, { Page, PageHeader } from "@/components/Container";
import RankedGame, { RankedHeaderBadge } from "@/components/game/RankedGame";
import { RecentRankedGames } from "@/components/RecentGames";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Ranked" };

const RankedPage = async () => {
  const token = await convexAuthNextjsToken();
  const user = token
    ? await fetchQuery(api.auth.loggedInUser, {}, { token }).catch(() => null)
    : null;

  return (
    <Page>
      <PageHeader
        eyebrow="Ranked"
        title="Challenge other players"
        description="Race an opponent to solve the same word. Wins gain Elo, losses cost it."
        actions={
          user ? (
            <RankedHeaderBadge initialElo={user.elo} initialGames={user.ranked.games} />
          ) : undefined
        }
      />
      {user ? (
        <>
          <RankedGame />
          <RecentRankedGames />
        </>
      ) : (
        <Container className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="bg-accent text-accent-foreground flex size-14 items-center justify-center rounded-2xl">
            <SwordsIcon className="size-7" />
          </span>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Sign in to play ranked</h2>
            <p className="text-muted-foreground max-w-sm text-sm">
              Ranked matches need an account so we can track your rating. New players start as{" "}
              {getRankTier(1000).name}.
            </p>
          </div>
          <Button asChild size="lg">
            <Link href="/sign-in">
              <LogInIcon /> Log in or sign up
            </Link>
          </Button>
        </Container>
      )}
    </Page>
  );
};
export default RankedPage;
