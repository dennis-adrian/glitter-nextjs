import type { NextConfig } from "next";

import { REMOTE_IMAGE_HOST_PATTERNS } from "../app/lib/images/remote-hosts";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [...REMOTE_IMAGE_HOST_PATTERNS],
  },
};

export default nextConfig;
