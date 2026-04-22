"use server";

import { fetchFullFestivalById } from "@/app/lib/festival_sectors/actions";
import { cache } from "react";
import { FestivalBase, FestivalWithDates, FullFestival } from "./definitions";
import { fetchActiveFestivalWithDates, fetchFestival } from "./actions";

export const getActiveFestival = cache(async () => {
	return await fetchFestival({});
});

// react.cache() is not needed here because fetchActiveFestivalWithDates uses
// "use cache", which already deduplicates across requests. If "use cache" is
// ever removed from that function, wrap this in react.cache() again for
// per-request memoization.
export async function getActiveFestivalBase(): Promise<FestivalWithDates | null> {
	return await fetchActiveFestivalWithDates();
}

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
