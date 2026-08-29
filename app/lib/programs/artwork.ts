export const DEFAULT_PROGRAM_ARTWORK =
  "/img/programs/program-banner-placeholder.svg";

const ALLOWED_REMOTE_ARTWORK_HOSTS = new Set([
  "img.clerk.com",
  "files.edgestore.dev",
  "utfs.io",
  "ufs.sh",
]);

const LOCAL_ARTWORK_ORIGIN = "https://glitter.invalid";

function isAllowedLocalArtworkPath(input: string): boolean {
  if (input.includes("\\") || input.includes(":")) {
    return false;
  }

  try {
    const parsed = new URL(input, LOCAL_ARTWORK_ORIGIN);
    if (parsed.origin !== LOCAL_ARTWORK_ORIGIN) {
      return false;
    }

    const decodedPathname = decodeURIComponent(parsed.pathname);
    const normalizedPathname = new URL(decodedPathname, LOCAL_ARTWORK_ORIGIN)
      .pathname;

    return normalizedPathname.startsWith("/img/");
  } catch {
    return false;
  }
}

export function isAllowedProgramArtworkUrl(
  input: string | null | undefined,
): input is string {
  if (!input) return false;

  // Same-origin public assets (Storybook mocks, placeholders under /img/...).
  if (isAllowedLocalArtworkPath(input)) {
    return true;
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
