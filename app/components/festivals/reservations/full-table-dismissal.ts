/**
 * Whether this browser has dismissed a festival's full-table banner.
 *
 * Kept out of the panel so the purchase flow can clear it without duplicating
 * the key. The two are far apart in the app and a drifted string would fail
 * silently — the banner would simply stay hidden.
 *
 * Every accessor swallows its errors: a browser refusing storage is not a
 * reason to fail the render or the upload it is attached to. Failing closed
 * here means the banner comes back, which is the safe direction.
 */
function dismissalKey(festivalId: number) {
  return `glitter:full-table-banner-dismissed:${festivalId}`;
}

export function isFullTableBannerDismissed(festivalId: number): boolean {
  try {
    return window.localStorage.getItem(dismissalKey(festivalId)) === "1";
  } catch {
    return false;
  }
}

export function dismissFullTableBanner(festivalId: number): void {
  try {
    window.localStorage.setItem(dismissalKey(festivalId), "1");
  } catch {
    // Nothing to do: it reappears next visit, which is the safe direction.
  }
}

/**
 * Forgets a dismissal, so the banner is offered again.
 *
 * Called when the participant buys credits for this festival's full table. A
 * dismissal means "not interested in the pitch"; paying for it says the
 * opposite, and from that point the banner is the only place to activate — or
 * to release the credits if activation already happened. Leaving it hidden
 * strands both.
 */
export function clearFullTableDismissal(festivalId: number): void {
  try {
    window.localStorage.removeItem(dismissalKey(festivalId));
  } catch {
    // The banner is already visible in a browser with no storage to read.
  }
}
