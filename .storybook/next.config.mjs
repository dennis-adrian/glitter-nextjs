import { REMOTE_IMAGE_HOST_PATTERNS } from "../app/lib/images/remote-hosts.ts";

/** @type {import("next").NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [...REMOTE_IMAGE_HOST_PATTERNS],
  },
};

export default nextConfig;
