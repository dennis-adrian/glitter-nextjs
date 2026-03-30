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
		];
	},
	skipTrailingSlashRedirect: true,
	cacheComponents: true,
	reactCompiler: true,
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
