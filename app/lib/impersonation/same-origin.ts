/**
 * Whether a request to start or end a view comes from Glitter's own pages,
 * the way Next checks a Server Action: the `Origin` host against the host
 * the request was made to (`X-Forwarded-Host` behind a proxy, `Host`
 * otherwise), not against `request.url`, which a proxy may rewrite. A
 * browser marks a cross-site fetch with `Sec-Fetch-Site`, so that is refused
 * too. No `Origin` at all is a same-origin GET-less form from an old browser
 * or a test client; the cookie's SameSite=Lax already keeps it from being
 * sent cross-site.
 */
export function isSameOriginRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (origin === "null") return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const forwarded = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host =
    forwarded || request.headers.get("host") || new URL(request.url).host;
  return originHost === host;
}
