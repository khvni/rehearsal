import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright", "@browserbasehq/stagehand", "pg"],

  // Serve static mockup index pages at their directory paths, e.g.
  // /mockups -> /mockups/index.html.
  async rewrites() {
    return [
      { source: "/mockups", destination: "/mockups/index.html" },
      { source: "/mockups/:slug([^/\\.]+)", destination: "/mockups/:slug/index.html" },
    ];
  },
};

export default nextConfig;
