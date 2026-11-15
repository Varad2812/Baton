import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Source uploads go through Server Actions, one file (max 5 MB) per call plus multipart overhead.
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
  },
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
