import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentUpgrade: "security",
    /**
     * Validate instant navigation only where a segment asks to be validated.
     *
     * The default, 'warning', validates every navigation in development. Not
     * one of them can pass here: this console is a client app behind a shell
     * that waits on the session cookie and then on the signed-in admin's
     * profile, because which areas they may open is not knowable until it
     * arrives — so every page under the dashboard is reported as a segment
     * that was dropped from rendering. Rendering those pages anyway, to
     * satisfy the check, would flash areas the admin may not be allowed to
     * see.
     *
     * 'manual-warning' keeps the tooling and reports only on segments that
     * opt in with `export const instant = true`, which is how a page here
     * would adopt instant navigation deliberately rather than being told it
     * has failed something it never claimed.
     */
    instantInsights: { validationLevel: "manual-warning" },
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
