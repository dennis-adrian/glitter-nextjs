import type { NextConfig } from "next";
import "@/env";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
      {
        source: "/presentaciones-en-vivo",
        destination: "/live-acts",
      },
    ];
  },
  skipTrailingSlashRedirect: true,
  reactCompiler: true,
  outputFileTracingIncludes: {
    // Turbopack matches this key with "contains" semantics against the raw
    // entry name (`app/api/.../route`), so it must not start with a slash.
    "api/festival_activities/*/couponbook/export": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
      {
        protocol: "https",
        hostname: "files.edgestore.dev",
      },
      {
        protocol: "https",
        hostname: "utfs.io",
      },
      {
        protocol: "https",
        hostname: "ufs.sh",
      },
      {
        protocol: "https",
        hostname: "**.ufs.sh",
      },
    ],
  },
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
};

export default nextConfig;
