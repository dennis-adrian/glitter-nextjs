import {
  FestivalBase,
  FestivalSectorBase,
} from "@/app/data/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";

export function getFestivalsOptions(festivals: FestivalBase[]) {
  return festivals.map((festival) => ({
    label: festival.name,
    value: festival.id.toString(),
  }));
}

export function groupVisitorEmails(visitors: { id: number; email: string }[]) {
  const visitorEmails = visitors.map((visitor) => visitor.email);
  let emailGroups: string[][] = [];
  for (let i = 0; i < visitorEmails.length; i += 50) {
    let group = visitorEmails.slice(i, i + 50);
    emailGroups.push(group);
  }

  return emailGroups;
}

export function orderSectors(sectors: FestivalSectorBase[]) {
  return sectors.sort((a, b) => a.orderInFestival - b.orderInFestival);
}
