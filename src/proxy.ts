import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";

// Next.js 16 renamed `middleware` to `proxy`. Convex Auth's handler is a
// standard Next.js request handler, so it works unchanged here.
export const proxy = convexAuthNextjsMiddleware();

export const config = {
  // Run on all routes except static assets, Next internals and the Sentry tunnel.
  matcher: ["/((?!.*\\..*|_next|monitoring).*)", "/", "/(api|trpc)(.*)"],
};
