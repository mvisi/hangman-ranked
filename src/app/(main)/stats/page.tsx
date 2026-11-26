import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/Container";
import StatsView from "@/components/stats/StatsView";

export const metadata: Metadata = { title: "Statistics" };

const StatsPage = async ({ searchParams }: PageProps<"/stats">) => {
  const { tab } = await searchParams;
  return (
    <Page>
      <PageHeader
        eyebrow="Statistics"
        title="Your numbers"
        description="Records, trends and habits from every game you've finished."
      />
      <StatsView initialTab={tab === "ranked" ? "ranked" : "solo"} />
    </Page>
  );
};
export default StatsPage;
