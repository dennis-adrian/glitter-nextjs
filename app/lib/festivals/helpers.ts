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

export async function groupVisitorEmails(visitors: { id: number; email: string }[]) {
	// Resend has a limit of 50 emails per group and the first email is the sender the other 49 will be in bcc
	const maxEmailsPerGroup = 49;
	const visitorEmails = visitors.map((visitor) => visitor.email);
	let emailGroups: string[][] = [];
	for (let i = 0; i < visitorEmails.length; i += maxEmailsPerGroup) {
		let group = visitorEmails.slice(i, i + maxEmailsPerGroup);
		emailGroups.push(group);
	}

	return emailGroups;
}