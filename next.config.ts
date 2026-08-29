import type { NextConfig } from "next";
import "@/env";

import { REMOTE_IMAGE_HOST_PATTERNS } from "@/app/lib/images/remote-hosts";

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
  async redirects() {
    return [
      {
        source: "/dashboard/subcategories",
        destination: "/dashboard/categories",
        permanent: true,
      },
    ];
  },
  reactCompiler: true,
  serverExternalPackages: ["@blocknote/server-util", "jsdom"],
  outputFileTracingIncludes: {
    // Turbopack matches this key with "contains" semantics against the raw
    // entry name (`app/api/.../route`), so it must not start with a slash.
    "api/festival_activities/*/couponbook/export": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
  },
  images: {
    remotePatterns: [...REMOTE_IMAGE_HOST_PATTERNS],
  },
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
};

export default nextConfig;
