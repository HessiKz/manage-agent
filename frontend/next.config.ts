import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  async rewrites() {
    const internal = process.env.INTERNAL_API_URL || "http://backend:8000";
    return [{ source: "/api/v1/:path*", destination: `${internal}/api/v1/:path*` }];
  },
};

export default config;
