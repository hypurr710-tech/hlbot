import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/hlbot",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
