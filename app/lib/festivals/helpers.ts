"use server";

import { fetchFestival } from "@/app/data/festivals/actions";
import { FullFestival } from "@/app/data/festivals/definitions";
import { fetchFullFestivalById } from "@/app/lib/festival_sectors/actions";
import { cache } from "react";

export const getActiveFestival = cache(async () => {
	return await fetchFestival({});
});

export const getFestivalById = cache(
  async (festivalId: number): Promise<FullFestival | undefined | null> => {
    return await fetchFullFestivalById(festivalId);
  },
);
