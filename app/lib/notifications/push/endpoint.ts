/**
 * The push services a browser may hand us an endpoint for. The server POSTs to
 * whatever endpoint is stored, signed with our key, so anything else is
 * refused: an internal address, a third-party site, or a slow host that eats
 * the drain's time budget.
 *
 * Chrome, Edge on Android, Samsung Internet and Opera use FCM; Firefox uses
 * Mozilla's autopush. Those two are matched exactly. Safari and iPhone use
 * Apple's (`web.push.apple.com` today; Apple asks to allow
 * `*.push.apple.com`), and Edge on Windows uses WNS (`wns2-*.notify…`), so
 * those two match at a dot boundary.
 */
const EXACT_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com"];
const SUFFIX_HOSTS = [".push.apple.com", ".notify.windows.com"];

export const MAX_ENDPOINT_LENGTH = 1024;

/**
 * Lowercase letters, digits and hyphens between dots, nothing else. The
 * WHATWG parser accepts `;`, quotes, braces and backticks inside a host, while
 * Node's legacy `url.parse`, which `web-push` sends with, ends the host there:
 * `https://127.0.0.1;.fcm.googleapis.com/` passes a suffix check and connects
 * to 127.0.0.1.
 */
const HOSTNAME_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function allowedHost(hostname: string) {
  return (
    EXACT_HOSTS.includes(hostname) ||
    SUFFIX_HOSTS.some((suffix) => hostname.endsWith(suffix))
  );
}

/**
 * Whether an endpoint may be stored and sent to. Checked when a device is
 * saved and again right before each send.
 *
 * The URL must come back from the WHATWG parser exactly as given, so input the
 * two parsers could read differently (a backslash, an `@`, odd casing or
 * whitespace) never gets this far.
 */
export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string") return false;
  if (endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_LENGTH) {
    return false;
  }
  if (/[\s\\@]/.test(endpoint)) return false;

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.href !== endpoint) return false;
  if (url.protocol !== "https:") return false;
  if (url.port !== "" || url.username !== "" || url.password !== "") {
    return false;
  }
  if (!HOSTNAME_RE.test(url.hostname)) return false;
  return allowedHost(url.hostname);
}

/** For logs: the push service's host, never the endpoint (a capability URL). */
export function pushEndpointHost(endpoint: string): string {
  try {
    const hostname = new URL(endpoint).hostname;
    return HOSTNAME_RE.test(hostname) ? hostname : "invalid";
  } catch {
    return "invalid";
  }
}
