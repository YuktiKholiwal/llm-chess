import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The scorecard used to live at /leaderboard and the arena at /. They swapped
  // when the results became the front door; keep the old path working.
  redirects: async () => [
    { source: "/leaderboard", destination: "/", permanent: true },
  ],
};

export default nextConfig;
