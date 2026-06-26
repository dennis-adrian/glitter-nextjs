import { connection } from "next/server";

import FestivalHappeningNotice from "@/app/components/organisms/store/festival-happening-notice";
import StoreClosedNotice from "@/app/components/organisms/store/store-closed-notice";
import { getActiveFestivalBase } from "@/app/lib/festivals/helpers";
import { resolveStoreClosure } from "@/app/lib/festivals/store-gate";
import { fetchStoreSettings } from "@/app/lib/store_settings/actions";
import type { StoreSection } from "@/app/lib/store_settings/definitions";

/**
 * Gates a single storefront section (merch / supplies). Resolves that section's
 * admin override against the festival auto-close and renders either the closed
 * notice or the section's content. Section chrome (subheader, cart) stays
 * mounted around this so visitors can still reach an open section.
 */
export default async function StoreSectionGate({
  section,
  children,
}: {
  section: StoreSection;
  children: React.ReactNode;
}) {
  // Opt into dynamic rendering so we can read the current time below.
  await connection();

  const [activeFestival, settings] = await Promise.all([
    getActiveFestivalBase(),
    fetchStoreSettings(section),
  ]);

  const closure = resolveStoreClosure({
    mode: settings.mode,
    closedTitle: settings.closedTitle,
    closedMessage: settings.closedMessage,
    festival: activeFestival,
    now: new Date(),
  });

  if (closure.closed) {
    return closure.source === "festival" ? (
      <FestivalHappeningNotice festival={closure.festival} />
    ) : (
      <StoreClosedNotice title={closure.title} message={closure.message} />
    );
  }

  return <>{children}</>;
}
