export const DEFAULT_PROGRAM_ARTWORK =
  "/img/programs/program-banner-placeholder.svg";

const ALLOWED_REMOTE_ARTWORK_HOSTS = new Set([
  "img.clerk.com",
  "files.edgestore.dev",
  "utfs.io",
  "ufs.sh",
]);

export function isAllowedProgramArtworkUrl(
  input: string | null | undefined,
): input is string {
  if (!input) return false;

  // Same-origin public assets (Storybook mocks, placeholders under /img/...).
  if (input.startsWith("/img/") && !input.startsWith("//")) {
    return !input.includes("\\") && !input.includes(":");
  }

  try {
    const url = new URL(input);
    const hostname = url.hostname.toLowerCase();

    return (
      url.protocol === "https:" &&
      (ALLOWED_REMOTE_ARTWORK_HOSTS.has(hostname) ||
        hostname.endsWith(".ufs.sh"))
    );
  } catch {
    return false;
  }
}

export function resolveProgramArtwork(
  input: string | null | undefined,
): string {
  return isAllowedProgramArtworkUrl(input) ? input : DEFAULT_PROGRAM_ARTWORK;
}
