import { getActiveFestivalBase } from "@/app/lib/festivals/helpers";
import {
  resolveStoreClosure,
  type StoreClosure,
} from "@/app/lib/festivals/store-gate";
import { fetchStoreSettings } from "./actions";
import type { StoreSection } from "./definitions";

export type ClosedStore = Extract<StoreClosure, { closed: true }>;

/**
 * Server-side resolution of whether a storefront section is closed, combining
 * that section's admin override with the festival auto-close. Shared by the
 * storefront gate (UI) and the cart/checkout mutations (enforcement) so both
 * agree on a single source of truth.
 */
export async function resolveSectionClosure(
  section: StoreSection,
): Promise<StoreClosure> {
  const [festival, settings] = await Promise.all([
    getActiveFestivalBase(),
    fetchStoreSettings(section),
  ]);

  return resolveStoreClosure({
    mode: settings.mode,
    closedTitle: settings.closedTitle,
    closedMessage: settings.closedMessage,
    festival,
    now: new Date(),
  });
}

/**
 * Returns the first closed section among `sections` (deduplicated), or null if
 * all are open. Used to gate a mixed cart that may span both sections.
 */
export async function findClosedSection(
  sections: StoreSection[],
): Promise<{ section: StoreSection; closure: ClosedStore } | null> {
  for (const section of [...new Set(sections)]) {
    const closure = await resolveSectionClosure(section);
    if (closure.closed) {
      return { section, closure };
    }
  }
  return null;
}

/** Visitor-facing message for a closed section, preferring the admin's custom copy. */
export function storeClosureMessage(closure: ClosedStore): string {
  if (closure.source === "manual") {
    return (
      closure.message?.trim() ||
      "Esta sección de la tienda está cerrada en este momento."
    );
  }
  return "La tiendita está en pausa mientras el festival está en curso.";
}
