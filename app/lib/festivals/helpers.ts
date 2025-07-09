"use server";

import { fetchFestival } from "@/app/data/festivals/actions";
import { fetchFullFestivalById } from "@/app/lib/festival_sectors/actions";
import { cache } from "react";
import { FullFestival } from "./definitions";

export const getActiveFestival = cache(async () => {
	return await fetchFestival({});
});

export const getFestivalById = cache(
  async (festivalId: number): Promise<FullFestival | undefined | null> => {
    return await fetchFullFestivalById(festivalId);
  },
);