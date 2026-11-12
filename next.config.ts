import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The sandbox preview panel embeds the app from a *.space-z.ai origin; Next 16
  // warns (and a future major blocks) cross-origin dev asset requests without it.
  allowedDevOrigins: ["*.space-z.ai"],
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
