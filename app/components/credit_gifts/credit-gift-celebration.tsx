import { headers } from "next/headers";

import CreditGiftCelebrationBanner from "@/app/components/credit_gifts/credit-gift-celebration-banner";
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { pushPublicKeyFor } from "@/app/lib/notifications/push/access";
import {
  fetchPendingGiftCelebration,
  type PendingCelebration,
  resolveInboxViewer,
} from "@/app/lib/notifications/queries";

async function loadPendingCelebration(): Promise<
  (PendingCelebration & { pushPublicKey: string | null }) | null
> {
  try {
    // A `force-static` render (the program pages) has no request behind it:
    // `headers()` is empty and Clerk cannot answer. The HTML is the same for
    // every visitor there, so it carries no personal banner. Same test as
    // `isLayoutFeatureEnabled`.
    if ((await headers()).keys().next().done) return null;
    const viewer = await resolveInboxViewer();
    if (!viewer || viewer.role !== "user") return null;
    if (!(await isFeatureEnabled("credits", viewer))) return null;
    const pending = await fetchPendingGiftCelebration(viewer.id);
    if (!pending) return null;
    // Resolved only with a gift to show: this runs on every request.
    return { ...pending, pushPublicKey: await pushPublicKeyFor(viewer) };
  } catch (error) {
    console.error("Failed to load the credit gift banner", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

/**
 * Gifts not yet celebrated, as one banner. Follows the `credits` flag, not the
 * inbox one: it points at the wallet, and it is how a gift reaches
 * participants before the bell does.
 *
 * A failed read renders nothing rather than taking the page down with it.
 */
export default async function CreditGiftCelebration() {
  const pending = await loadPendingCelebration();
  if (!pending) return null;
  return (
    <CreditGiftCelebrationBanner
      notificationIds={pending.notificationIds}
      totalCredits={pending.totalCredits}
      pushPublicKey={pending.pushPublicKey}
    />
  );
}
