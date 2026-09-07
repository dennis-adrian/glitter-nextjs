/**
 * `/programs/purchases/[id]?token=...` puts a purchase access credential in the
 * URL, and PostHog copies the URL into `$current_url`, `$referrer` and their
 * initial/session-entry variants on every event. Left alone, anyone with
 * analytics access could read a token and open someone else's purchase.
 *
 * Applied as a `before_send` hook, so it covers autocaptured pageviews too —
 * not just the events this app writes by hand.
 */

/** Query params whose value is a credential rather than an analytics dimension. */
const SENSITIVE_QUERY_PARAMS = ["token"];

const SENSITIVE_PARAM_PATTERN = new RegExp(
  `([?&](?:${SENSITIVE_QUERY_PARAMS.join("|")})=)[^&#]*`,
  "gi",
);

/**
 * Replaces sensitive query values in a URL-like string, leaving the rest — path,
 * campaign params, fragment — intact so the event is still usable.
 *
 * Operates on the raw string rather than `new URL()`: PostHog also sends
 * relative and partial URLs, and a parse failure must not drop the property.
 */
export function redactSensitiveUrlParams(value: string): string {
  return value.replace(SENSITIVE_PARAM_PATTERN, "$1redacted");
}

/**
 * Every property that can carry a URL, redacted in place. Non-string values are
 * passed through untouched.
 */
export function redactEventProperties<T extends Record<string, unknown>>(
  properties: T,
): T {
  let next: Record<string, unknown> | null = null;

  for (const [key, value] of Object.entries(properties)) {
    if (typeof value !== "string") continue;

    const redacted = redactSensitiveUrlParams(value);
    if (redacted === value) continue;

    // Copied lazily: the overwhelming majority of events have nothing to redact
    // and should not pay for a clone.
    next ??= { ...properties };
    next[key] = redacted;
  }

  return (next ?? properties) as T;
}
