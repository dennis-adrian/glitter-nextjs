"use client";

import { useSyncExternalStore } from "react";

// Nothing to subscribe to: the value flips once, from the server snapshot to
// the browser one, and React makes that switch on its own.
function subscribe() {
  return () => {};
}

function getSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

/**
 * `false` on the server and while React hydrates the server HTML; `true` on
 * every render after that, including the first render of anything mounted by
 * a client-side navigation.
 *
 * For markup that depends on something only the browser knows. While
 * hydrating, React reads `getServerSnapshot`, so the first browser render
 * matches the server's; right after that commit it sees the snapshot changed
 * and renders again with `true`. No hydration mismatch, and no `setState` in
 * an effect (the same reason `use-recent-check-ins.ts` reads `sessionStorage`
 * through `useSyncExternalStore`).
 *
 * React 19.3's `use(browser())` (Next's single-page-applications guide) gets
 * the same result by client-rendering the nearest `<Suspense>`. This hook needs
 * no boundary, so forgetting one cannot quietly move a whole layout to the
 * browser.
 *
 * Whatever sits behind it is never in the server HTML: keep content crawlers
 * should index outside it.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
