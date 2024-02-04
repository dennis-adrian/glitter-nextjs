import { Festival } from "@/app/api/festivals/actions";
import { SearchOption } from "@/app/components/ui/search-input/search-content";

export function getFestivalDateLabel(festival: Festival) {
  const startDateDay = festival.startDate.getDate() + 1;
  const endDateDay = festival.endDate.getDate() + 1;
  const startDateMonth = festival.startDate.toLocaleString("es-ES", {
    month: "long",
  });

  return `${startDateDay} y ${endDateDay} de ${startDateMonth}`;
}

export function getSearchArtistOptions(festival: Festival): SearchOption[] {
  return festival.userRequests.map(({ user: artist }) => ({
    displayName: artist.displayName!,
    id: artist.id,
  }));
}
