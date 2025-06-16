import { BaseProfile } from "@/app/api/users/definitions";
import { FestivalBase } from "@/app/data/festivals/definitions";

export function getFestivalsOptions(festivals: FestivalBase[]) {
  return festivals.map((festival) => ({
    label: festival.name,
    value: festival.id.toString(),
  }));
}

export function groupVisitorEmails(visitors: { id: number; email: string }[]) {
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
