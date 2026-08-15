/**
 * Route segments are untrusted strings. `parseInt` accepts partial matches
 * ("12abc" → 12) and non-positive ids ("0", "-1"), so ids are validated as
 * canonical positive integers before any query runs.
 */
export function parseRouteId(value: string | undefined): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
