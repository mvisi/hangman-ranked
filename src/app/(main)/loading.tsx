import { Page } from "@/components/Container";
import { Skeleton } from "@/components/ui/skeleton";

const Loading = () => (
  <Page>
    <div className="space-y-2 pt-8 md:pt-12">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-10 w-80 max-w-full" />
      <Skeleton className="h-5 w-96 max-w-full" />
    </div>
    <Skeleton className="mt-6 h-80 w-full rounded-2xl" />
  </Page>
);

export default Loading;
