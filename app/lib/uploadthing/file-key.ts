/**
 * What an UploadThing file URL looks like. Pure and client-safe, unlike
 * `./storage`, so the comunicado content rules and the sanitizer can use it
 * on either side.
 */

function isUploadThingHost(hostname: string) {
  return (
    hostname === "utfs.io" ||
    hostname === "ufs.sh" ||
    hostname.endsWith(".ufs.sh")
  );
}

/** The UploadThing key in a utfs.io / ufs.sh file URL, or null for any other URL. */
export function getUploadThingFileKey(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    if (isUploadThingHost(parsedUrl.hostname)) {
      const fileKey = parsedUrl.pathname.split("/f/")[1];
      return fileKey || null;
    }
  } catch {
    return null;
  }

  return null;
}

const FILE_PATH = /^\/f\/[^/]+$/;

/**
 * Whether `url` is a file uploaded to UploadThing, exactly as written:
 * `https:`, a utfs.io / ufs.sh / *.ufs.sh host with no port or credentials,
 * a bare `/f/<key>` path, and no query or fragment. Stricter than
 * `getUploadThingFileKey`, which also reads `http:` and a query; comunicado
 * images must pass it (C2.5).
 */
export function isUploadThingFileUrl(url: string): boolean {
  if (typeof url !== "string" || /[?#]/.test(url)) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    // A parser trims, lower-cases, encodes and resolves "..": an address it
    // had to clean is not the one that would be stored and shown.
    parsed.href === url &&
    parsed.protocol === "https:" &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.port === "" &&
    isUploadThingHost(parsed.hostname) &&
    FILE_PATH.test(parsed.pathname)
  );
}
