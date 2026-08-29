export const REMOTE_IMAGE_HOST_PATTERNS = [
  { protocol: "https" as const, hostname: "img.clerk.com" },
  { protocol: "https" as const, hostname: "files.edgestore.dev" },
  { protocol: "https" as const, hostname: "utfs.io" },
  { protocol: "https" as const, hostname: "ufs.sh" },
  { protocol: "https" as const, hostname: "**.ufs.sh" },
] as const;

const EXACT_REMOTE_IMAGE_HOSTS = new Set<string>(
  REMOTE_IMAGE_HOST_PATTERNS.filter(
    (pattern) => !pattern.hostname.startsWith("**."),
  ).map((pattern) => pattern.hostname),
);

export function isAllowedRemoteImageHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (EXACT_REMOTE_IMAGE_HOSTS.has(lower)) return true;
  return lower.endsWith(".ufs.sh");
}
