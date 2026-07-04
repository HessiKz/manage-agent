import type { NextConfig } from "next";

const isVercel = Boolean(process.env.VERCEL);
const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT);
const isHostedFrontend = isVercel || isRailway;
const internalApi = process.env.INTERNAL_API_URL?.trim();

const LONG_PROXY_TIMEOUT_MS =
  Number(process.env.NEXT_PUBLIC_API_LONG_TIMEOUT_MS) || 600_000;

const config: NextConfig = {
  // Standalone is for Docker; Vercel/Railway use their own output pipeline
  ...(isHostedFrontend ? {} : { output: "standalone" as const }),
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
    // Default rewrite proxy is 30s — LLM routes (instructions/refresh, invoke) need longer.
    proxyTimeout: LONG_PROXY_TIMEOUT_MS,
  },
  async rewrites() {
    if (!internalApi) {
      if (isHostedFrontend) {
        console.warn(
          "[manage-agent] INTERNAL_API_URL is unset on a hosted frontend — set it to your FastAPI URL, " +
            "or set NEXT_PUBLIC_API_URL to call the API directly from the browser."
        );
      }
      return [];
    }
    const destination = trimTrailingSlash(internalApi);
    return [{ source: "/api/v1/:path*", destination: `${destination}/api/v1/:path*` }];
  },
};

function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

export default config;
