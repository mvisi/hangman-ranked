import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "ui-avatars.com" }],
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/build/
  org: "visar-mullaj",
  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // The route is excluded from the proxy matcher in `src/proxy.ts`.
  tunnelRoute: "/monitoring",

  // Strip Sentry's own debug logging from the bundles (works for webpack and Turbopack).
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
  },
});
