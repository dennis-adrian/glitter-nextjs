import "server-only";

import { and, eq, exists, inArray, sql } from "drizzle-orm";

import type { BaseProfile } from "@/app/api/users/definitions";
import { getFestivalSectorAllowedCategories } from "@/app/lib/festival_sectors/helpers";
import { db } from "@/db";
import { festivalSectors, profileSubcategories, users } from "@/db/schema";

/**
 * Who a festival's activation reaches, by email (`invitations.ts`) and in
 * Glitter (`activation-notifications.ts`). Kept out of those "use server"
 * modules, which may only export actions.
 */

/**
 * The participant categories a festival has stands for: who the activation
 * mail is for. Leaves out the retired `new_artist` and `none`, which no
 * participant can reserve under.
 */
export async function festivalCategories(festivalId: number) {
  const sectors = await db.query.festivalSectors.findMany({
    columns: { id: true },
    with: { stands: { columns: { standCategory: true } } },
    where: eq(festivalSectors.festivalId, festivalId),
  });
  return [
    ...new Set(
      sectors.flatMap((sector) => getFestivalSectorAllowedCategories(sector)),
    ),
  ].filter((category) => category !== "none");
}

/**
 * Who can act on the activation mail. Its button opens the festival's terms
 * page, which turns away a profile without subcategories, so mailing one
 * would only send them to an error.
 */
export function invitableParticipant(categories: BaseProfile["category"][]) {
  return and(
    eq(users.status, "verified"),
    inArray(users.category, categories),
    exists(
      db
        .select({ one: sql`1` })
        .from(profileSubcategories)
        .where(eq(profileSubcategories.profileId, users.id)),
    ),
  );
}
