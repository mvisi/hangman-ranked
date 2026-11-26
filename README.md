# Hangman Ranked

A modern, real-time web implementation of Hangman with solo and ranked multiplayer modes, built with Next.js and Convex. Players can play casual solo games (as a guest or signed in) or compete head-to-head in ranked matches with an Elo rating system.

## Features

- **Solo & guest play**: play instantly as a guest, or sign in to record scores, streaks, detailed statistics, and personal records.
- **Ranked matches**: real-time matchmaking pairs players by closest Elo to race on the same word. First to solve wins; 6 mistakes, resigning, or running out of time awards the win to the opponent.
- **Placement matches**: players complete 5 ranked matches before appearing on the global Elo leaderboard.
- **Server-enforced timers**: per-turn timeouts run via Convex scheduled functions with cron safety nets and NTP-style client clock sync.
- **Leaderboards & statistics**: per-player high-score and fastest-solve solo leaderboards, ranked Elo leaderboard, activity heatmaps, score/accuracy trends, and public player profiles.
- **Curated word list**: pre-filtered word list in `convex/data/allWords.ts`.

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS 4, Radix UI, Recharts, Motion
- **Backend**: Convex (realtime database, server functions, scheduler, crons)
- **Auth**: `@convex-dev/auth` (GitHub, Google, and email/password with validated unique usernames)
- **Testing**: Vitest + `convex-test`

## Getting Started

### Requirements

- Node.js 22+
- pnpm

### Install

```bash
pnpm install
```

### Local development

Run the Convex backend and Next.js frontend in separate terminals:

```bash
pnpm run dev:convex
pnpm run dev
```

### Verification

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

## Customization & Data

The game uses a curated word list at `convex/data/allWords.ts` and a username blocklist at `convex/data/notAllowedUsernames.ts`.

## Issues

For questions or help, open an issue in this repository.
