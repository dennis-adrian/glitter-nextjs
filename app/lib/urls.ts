/**
 * The origin every outbound link is built on, without a trailing slash.
 *
 * An unset *or empty* `NEXT_PUBLIC_BASE_URL` both count as missing: `??` only
 * catches `undefined`, so an empty value used to survive and produce relative
 * links that are dead in an email client. Production then uses its own domain
 * (`VERCEL_PROJECT_PRODUCTION_URL`), since `VERCEL_URL` there is the
 * deployment's generated host: it changes with every deploy and Vercel's
 * deployment protection can put it behind a login. Elsewhere, or when that is
 * missing, `VERCEL_URL`: it is set on every deployment, which is what keeps
 * the localhost fallback — useful in local development, useless in an inbox —
 * out of anything deployed.
 *
 * Deliberately does not throw: it is also called while rendering pages (the
 * buyer's purchase page builds its recovery link with it), and a
 * misconfigured environment should degrade to a wrong link there, not a 500.
 * Code that must not send a wrong link checks `emailBaseUrlProblem` first.
 */
export function publicBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim().replace(
    /\/+$/,
    "",
  );
  if (configured) return configured;

  const host = (value: string | undefined) =>
    value?.trim().replace(/\/+$/, "") || undefined;
  const vercel =
    (process.env.VERCEL_ENV === "production"
      ? host(process.env.VERCEL_PROJECT_PRODUCTION_URL)
      : undefined) ?? host(process.env.VERCEL_URL);
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

/**
 * Why links built on `url` would not work in an email sent from `vercelEnv`,
 * or null when they would. Development sends nothing, so anything goes there.
 */
export function emailBaseUrlProblem(
  url: string,
  vercelEnv: string,
): string | null {
  if (vercelEnv === "development") return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `the public base URL "${url}" is not a URL`;
  }
  if (parsed.protocol !== "https:") {
    return `the public base URL "${url}" is not https`;
  }
  const hostname = parsed.hostname.toLowerCase();
  if (LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")) {
    return `the public base URL "${url}" points at this machine`;
  }
  return null;
}
