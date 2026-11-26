import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { CalendarIcon, ClockIcon, FlameIcon, PercentIcon, StarIcon, SwordsIcon, TrendingUpIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import { EloChart } from "@/components/charts/EloChart";
import Container, { Page } from "@/components/Container";
import ProfileActions from "@/components/ProfileActions";
import { RankedGamesTable } from "@/components/RecentGames";
import { RankBadge, TierProgress } from "@/components/stats/RankBadge";
import { StatGrid, StatTile } from "@/components/stats/StatTile";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDate, formatPercent, formatRelative } from "@/lib/utils";

function decodeName(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: PageProps<"/profile/[user]">): Promise<Metadata> {
  const { user } = await params;
  return { title: decodeName(user) };
}

const ProfilePage = async ({ params }: PageProps<"/profile/[user]">) => {
  const { user } = await params;
  const token = await convexAuthNextjsToken();
  const profile = await fetchQuery(
    api.user.getUserProfile,
    { userName: decodeName(user) },
    { token },
  ).catch(() => null);

  if (!profile) notFound();

  const losses = profile.ranked.games - profile.ranked.wins;
  const rankLabel = profile.rank
    ? `#${profile.rank} worldwide`
    : profile.placement.played > 0
      ? `Placement (${profile.placement.played}/${profile.placement.required})`
      : "Unranked";

  return (
    <Page>
      <Container className="mt-8 md:mt-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="size-16 rounded-2xl sm:size-20">
              <AvatarImage src={profile.image} alt="" className="rounded-2xl" />
              <AvatarFallback className="rounded-2xl text-xl">
                {profile.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1.5">
              <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{profile.name}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <RankBadge elo={profile.elo} showElo />
                <span className="text-muted-foreground text-sm font-medium">{rankLabel}</span>
              </div>
            </div>
          </div>
          {profile.isSelf && <ProfileActions currentName={profile.name} />}
        </div>

        <div className="text-muted-foreground mt-5 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="flex items-center gap-1.5">
            <CalendarIcon className="size-4" /> Joined {formatDate(profile.accountCreated)}
          </span>
          <span className="flex items-center gap-1.5">
            <ClockIcon className="size-4" /> Last seen {formatRelative(profile.lastSeen).toLowerCase()}
          </span>
          {profile.isSelf && (
            <Link href="/stats" className="text-primary font-medium hover:underline">
              View detailed stats →
            </Link>
          )}
        </div>

        <div className="mt-5 max-w-md">
          <TierProgress elo={profile.elo} />
        </div>
      </Container>

      <StatGrid className="mt-4">
        <StatTile icon={TrendingUpIcon} label="Peak Elo" value={profile.peakElo} />
        <StatTile
          icon={SwordsIcon}
          label="Ranked record"
          value={`${profile.ranked.wins}–${losses}`}
          hint={`${formatPercent(profile.ranked.winRate)} win rate`}
        />
        <StatTile
          icon={FlameIcon}
          label="Ranked streak"
          value={profile.ranked.streak}
          hint={`Best: ${profile.ranked.bestStreak}`}
        />
        <StatTile
          icon={profile.solo.bestScore ? StarIcon : PercentIcon}
          label="Solo best"
          value={profile.solo.bestScore || "–"}
          hint={`${profile.solo.games} solo games · ${formatPercent(profile.solo.winRate)} won`}
        />
      </StatGrid>

      <div className="mt-4">
        <EloChart
          data={profile.eloHistory}
          title="Elo history"
          description={`${profile.name}'s rating after each ranked match.`}
        />
      </div>

      <RankedGamesTable
        games={profile.recentGames}
        title="Match history"
        description={`Every ranked match ${profile.isSelf ? "you've" : `${profile.name} has`} played.`}
        pageSize={8}
      />
    </Page>
  );
};
export default ProfilePage;
