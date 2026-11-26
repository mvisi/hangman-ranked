import { HomeIcon } from "lucide-react";
import Link from "next/link";
import { Page } from "@/components/Container";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <Navbar />
      <Page className="flex flex-col items-center gap-6 py-20 text-center">
        <div className="flex gap-1.5 font-mono text-4xl font-bold uppercase" aria-hidden="true">
          {["_", "_", "_", "_"].map((_, i) => (
            <span key={i} className="bg-muted/60 border-border flex h-14 w-11 items-center justify-center rounded-lg border-b-4" />
          ))}
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Page not found</h1>
          <p className="text-muted-foreground">
            We couldn&apos;t guess this one. The page or player you&apos;re looking for doesn&apos;t exist.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/">
            <HomeIcon /> Back home
          </Link>
        </Button>
      </Page>
    </>
  );
}
