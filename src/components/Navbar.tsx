"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import {
  BarChart3Icon,
  GamepadIcon,
  LogInIcon,
  LogOutIcon,
  SwordsIcon,
  TrophyIcon,
  UserIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "../../convex/_generated/api";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Logo } from "@/components/layout/Logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, profileHref } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Play", icon: GamepadIcon },
  { href: "/ranked", label: "Ranked", icon: SwordsIcon },
  { href: "/leaderboard", label: "Leaderboard", icon: TrophyIcon },
  { href: "/stats", label: "Stats", icon: BarChart3Icon },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

const Navbar = () => {
  const pathname = usePathname();

  return (
    <>
      <nav className="bg-background/75 sticky top-0 z-50 border-b backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <Link href="/" aria-label="Hangman Ranked home" className="rounded-lg">
              <Logo />
            </Link>
            <ul className="hidden items-center gap-1 md:flex">
              {LINKS.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={isActive(pathname, href) ? "page" : undefined}
                    className={cn(
                      "text-muted-foreground hover:text-foreground hover:bg-accent rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive(pathname, href) && "text-foreground bg-accent",
                    )}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <AuthLoading>
              <Skeleton className="size-9 rounded-full" />
            </AuthLoading>
            <Authenticated>
              <UserMenu />
            </Authenticated>
            <Unauthenticated>
              <Button asChild size="sm" className="ml-1">
                <Link href="/sign-in">
                  <LogInIcon /> Log in
                </Link>
              </Button>
            </Unauthenticated>
          </div>
        </div>
      </nav>

      {/* Mobile tab bar */}
      <nav
        aria-label="Primary"
        className="bg-background/85 fixed inset-x-0 bottom-0 z-50 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "text-muted-foreground flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                    active && "text-primary",
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
};

function UserMenu() {
  const user = useQuery(api.auth.loggedInUser);
  const { signOut } = useAuthActions();
  const router = useRouter();

  if (!user) return <Skeleton className="size-9 rounded-full" />;
  const name = user.name ?? "Player";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="hover:bg-accent focus-visible:ring-ring/50 flex items-center gap-2 rounded-full py-1 pr-1 pl-3 text-sm font-medium outline-none focus-visible:ring-[3px]"
          aria-label="Account menu"
        >
          <span className="hidden max-w-32 truncate sm:inline">{name}</span>
          <span className="bg-secondary text-secondary-foreground tabular hidden rounded-full px-2 py-0.5 text-xs sm:inline">
            {user.elo}
          </span>
          <Avatar className="size-8">
            <AvatarImage src={user.image} alt="" />
            <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate font-semibold">{name}</p>
          <p className="text-muted-foreground text-xs">Elo {user.elo}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={profileHref(name)}>
            <UserIcon /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/stats">
            <BarChart3Icon /> Statistics
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await signOut();
            router.refresh();
          }}
        >
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default Navbar;
