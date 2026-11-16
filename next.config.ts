import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server in .next/standalone for the Docker image.
  // Vercel and `npm run dev` ignore it; the demo build uses its own config.
  output: "standalone",
};

export default nextConfig;
