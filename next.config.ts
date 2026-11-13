import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright", "@browserbasehq/stagehand", "pg"],
};

export default nextConfig;
