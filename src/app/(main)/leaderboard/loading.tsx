import { Page } from "@/components/Container";
import { Skeleton } from "@/components/ui/skeleton";

const Loading = () => (
  <Page>
    <div className="space-y-2 pt-8 md:pt-12">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-5 w-80 max-w-full" />
    </div>
    <Skeleton className="mt-6 h-10 w-80 max-w-full rounded-xl" />
    <div className="bg-card mt-4 space-y-3 rounded-2xl border p-5">
      {Array.from({ length: 10 }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  </Page>
);

export default Loading;
