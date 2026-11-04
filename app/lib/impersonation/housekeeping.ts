import "server-only";

// eslint-disable-next-line no-restricted-imports -- the one sanctioned use outside the view's own bookkeeping
import { allowImpersonationWrites } from "@/db/write-guard";

/**
 * Lets one write through during a view of the app as a participant, for
 * housekeeping that belongs to nobody: an idempotent `ON CONFLICT DO NOTHING`
 * insert of a global default row that a page needs to render (store and
 * program settings, a feature flag's first row). Without it, such a page
 * would crash for the admin while the row is missing.
 *
 * Never for anything a person owns or would see change: read marks, carts,
 * profiles, devices, counters keyed to someone. ESLint refuses this import
 * outside a commented exemption, so each use is a reviewed decision.
 */
export function allowHousekeepingWrite<T>(
  fn: () => PromiseLike<T> | T,
): Promise<T> {
  return allowImpersonationWrites(fn);
}
