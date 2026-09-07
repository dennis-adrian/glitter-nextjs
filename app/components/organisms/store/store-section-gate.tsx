import { connection } from "next/server";

import FestivalHappeningNotice from "@/app/components/organisms/store/festival-happening-notice";
import StoreClosedNotice from "@/app/components/organisms/store/store-closed-notice";
import { resolveSectionClosure } from "@/app/lib/store_settings/closure";
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

  const closure = await resolveSectionClosure(section);

  if (closure.closed) {
    return closure.source === "festival" ? (
      <FestivalHappeningNotice festival={closure.festival} />
    ) : (
      <StoreClosedNotice title={closure.title} message={closure.message} />
    );
  }

  return <>{children}</>;
}
