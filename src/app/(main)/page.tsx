import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { ArrowRightIcon, SwordsIcon, TrophyIcon } from "lucide-react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { Page, PageHeader } from "@/components/Container";
import GuestGame from "@/components/game/GuestGame";
import SoloGame from "@/components/game/SoloGame";
import HomeStats from "@/components/HomeStats";
import { RecentSoloGames } from "@/components/RecentGames";

const HomePage = async () => {
  const token = await convexAuthNextjsToken();
  const user = token
    ? await fetchQuery(api.auth.loggedInUser, {}, { token }).catch(() => null)
    : null;

  return (
    <Page>
      {user ? (
        <PageHeader
          eyebrow={`Welcome back, ${user.name}`}
          title="Ready for the next word?"
          description="Every solo win counts towards your stats and the global high-score table."
        />
      ) : (
        <PageHeader
          eyebrow="Hangman, but competitive"
          title="Guess the word. Climb the ladder."
          description="Play quick solo rounds, or race other players head-to-head in ranked matches with Elo ratings."
        />
      )}

      {user && <HomeStats />}
      {user ? <SoloGame /> : <GuestGame />}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <ModeCard
          href="/ranked"
          icon={SwordsIcon}
          title="Ranked matches"
          description="Same word, two players, one winner. Win to gain Elo."
        />
        <ModeCard
          href="/leaderboard"
          icon={TrophyIcon}
          title="Leaderboards"
          description="See the highest scores, fastest solves and top-rated players."
        />
      </div>

      {user && <RecentSoloGames />}
    </Page>
  );
};

function ModeCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof SwordsIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group bg-card hover:border-primary/40 focus-visible:ring-ring/50 flex items-start gap-4 rounded-2xl border p-5 shadow-sm transition-all outline-none hover:shadow-md focus-visible:ring-[3px]"
    >
      <span className="bg-accent text-accent-foreground flex size-11 shrink-0 items-center justify-center rounded-xl">
        <Icon className="size-5" />
      </span>
      <span className="flex-1">
        <span className="flex items-center gap-1 font-semibold">
          {title}
          <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
        <span className="text-muted-foreground mt-0.5 block text-sm">{description}</span>
      </span>
    </Link>
  );
}

export default HomePage;
