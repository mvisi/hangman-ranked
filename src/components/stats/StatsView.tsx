"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { BarChart3Icon, LogInIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import RankedStats from "./RankedStats";
import SoloStats from "./SoloStats";
import Container from "@/components/Container";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Tab = "solo" | "ranked";

export default function StatsView({ initialTab }: { initialTab: Tab }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <>
      <AuthLoading>
        <Skeleton className="mt-6 h-96 w-full rounded-2xl" />
      </AuthLoading>
      <Unauthenticated>
        <Container className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="bg-accent text-accent-foreground flex size-14 items-center justify-center rounded-2xl">
            <BarChart3Icon className="size-7" />
          </span>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Sign in to see your statistics</h2>
            <p className="text-muted-foreground max-w-sm text-sm">
              We keep track of every game you play once you have an account.
            </p>
          </div>
          <Button asChild size="lg">
            <Link href="/sign-in">
              <LogInIcon /> Log in
            </Link>
          </Button>
        </Container>
      </Unauthenticated>
      <Authenticated>
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value as Tab);
            router.replace(value === "solo" ? "/stats" : `/stats?tab=${value}`, { scroll: false });
          }}
          className="mt-6"
        >
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="solo" className="px-6">
              Solo
            </TabsTrigger>
            <TabsTrigger value="ranked" className="px-6">
              Ranked
            </TabsTrigger>
          </TabsList>
          <TabsContent value="solo">
            <SoloStats />
          </TabsContent>
          <TabsContent value="ranked">
            <RankedStats />
          </TabsContent>
        </Tabs>
      </Authenticated>
    </>
  );
}

export function StatsSkeleton() {
  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}

export function EmptyStats({
  title,
  description,
  href,
  cta,
}: {
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <Container className="flex flex-col items-center gap-3 py-12 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
      <Button asChild>
        <Link href={href}>{cta}</Link>
      </Button>
    </Container>
  );
}
