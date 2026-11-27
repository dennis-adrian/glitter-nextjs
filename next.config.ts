import type { NextConfig } from "next";
import "@/env";

import { REMOTE_IMAGE_HOST_PATTERNS } from "@/app/lib/images/remote-hosts";
import { LEGACY_SHARE_IMAGE_ROUTES } from "@/app/lib/share-image-routes";

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
      ...LEGACY_SHARE_IMAGE_ROUTES.map(({ source, destination }) => ({
        source,
        destination,
      })),
    ];
  },
  skipTrailingSlashRedirect: true,
  async headers() {
    return [
      {
        // The push service worker. Never cached, so a fix reaches every device
        // on its next visit; and allowed to load nothing from elsewhere.
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/dashboard/subcategories",
        destination: "/dashboard/categories",
        permanent: true,
      },
      // Live acts became cultural activities. The landing footer (CMS
      // content) still links the old public address.
      {
        source: "/presentaciones-en-vivo",
        destination: "/actividades-culturales",
        permanent: true,
      },
      {
        source: "/live-acts",
        destination: "/actividades-culturales",
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
