"use server";

import { fetchFullFestivalById } from "@/app/lib/festival_sectors/actions";
import { cache } from "react";
import { fetchActiveFestival } from "./actions";
import { FullFestival } from "./definitions";

export const getActiveFestival = cache(async () => {
  return await fetchActiveFestival({});
});

export const getFestivalById = cache(
  async (festivalId: number): Promise<FullFestival | undefined | null> => {
    return await fetchFullFestivalById(festivalId);
  },
);