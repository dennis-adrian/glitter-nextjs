"use server";

import { fetchFullFestivalById } from "@/app/lib/festival_sectors/actions";
import { cache } from "react";
import { FestivalBase, FullFestival } from "./definitions";
import { fetchFestival } from "./actions";

export const getActiveFestival = cache(async () => {
	return await fetchFestival({});
});

export const getFestivalById = cache(
  async (festivalId: number): Promise<FullFestival | undefined | null> => {
    return await fetchFullFestivalById(festivalId);
  },
);

export async function getFestivalsOptions(festivals: FestivalBase[]) {
  return festivals.map((festival) => ({
    label: festival.name,
    value: festival.id.toString(),
  }));
}
