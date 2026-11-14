import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Source uploads go through a Server Action: up to 10 files x 2 MB plus multipart overhead.
  experimental: {
    serverActions: { bodySizeLimit: "21mb" },
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
