import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { festivalDates, festivals } from "@/db/schema";
import type { LandingPageContentV1 } from "./definitions";

export type ResolvedFestival = typeof festivals.$inferSelect & {
  festivalDates: Array<typeof festivalDates.$inferSelect>;
};
const publicStatuses = ["published", "active"] as const;

async function festivalById(id: number, preview: boolean) {
  return db.query.festivals.findFirst({
    where: preview
      ? eq(festivals.id, id)
      : and(eq(festivals.id, id), inArray(festivals.status, publicStatuses)),
    with: { festivalDates: { orderBy: [asc(festivalDates.startDate)] } },
  }) as Promise<ResolvedFestival | undefined>;
}

export async function resolveLandingFestivals(
  content: LandingPageContentV1,
  preview = false,
) {
  const event = content.sections.eventSpotlight;
  let spotlight: ResolvedFestival | null = null;
  if (event.source === "selected" && event.festivalId)
    spotlight = (await festivalById(event.festivalId, preview)) ?? null;
  if (event.source === "active") {
    spotlight =
      ((await db.query.festivals.findFirst({
        where: eq(festivals.status, "active"),
        with: { festivalDates: { orderBy: [asc(festivalDates.startDate)] } },
      })) as ResolvedFestival | undefined) ?? null;
  }
  const family = await Promise.all(
    content.sections.festivalFamily.items.map(async (item) => {
      const rows = (await db.query.festivals.findMany({
        where: preview
          ? eq(festivals.festivalType, item.festivalType)
          : and(
              eq(festivals.festivalType, item.festivalType),
              inArray(festivals.status, publicStatuses),
            ),
        with: { festivalDates: { orderBy: [asc(festivalDates.startDate)] } },
      })) as ResolvedFestival[];
      const now = new Date();
      const next =
        rows
          .filter((festival) =>
            festival.festivalDates.some((date) => date.endDate >= now),
          )
          .sort(
            (a, b) =>
              (a.festivalDates[0]?.startDate.getTime() ?? 0) -
              (b.festivalDates[0]?.startDate.getTime() ?? 0),
          )[0] ?? null;
      const latest =
        [...rows].sort(
          (a, b) =>
            (b.festivalDates.at(-1)?.startDate.getTime() ?? 0) -
            (a.festivalDates.at(-1)?.startDate.getTime() ?? 0),
        )[0] ?? null;
      return { ...item, occurrence: next ?? latest };
    }),
  );
  return { spotlight, family };
}

export async function isEligiblePublishedFestival(id: number) {
  return Boolean(await festivalById(id, false));
}

export async function listLandingFestivalOptions() {
  return db
    .select({
      id: festivals.id,
      name: festivals.name,
      status: festivals.status,
      festivalType: festivals.festivalType,
    })
    .from(festivals)
    .orderBy(asc(festivals.name));
}
