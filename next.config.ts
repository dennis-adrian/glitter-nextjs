import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
