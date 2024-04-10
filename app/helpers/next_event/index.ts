import {
  FestivalBase,
  FestivalWithUserRequests,
} from "@/app/data/festivals/definitions";
import {
  ProfileType,
  ProfileWithParticipationsAndRequests,
} from "@/app/api/users/definitions";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import { SearchOption } from "@/app/components/ui/search-input/search-content";
import { getParticipantsOptions } from "@/app/api/reservations/helpers";

export function getFestivalDateLabel(
  festival: FestivalBase,
  withWeekday = false,
) {
  const startWeekday = festival.startDate.toLocaleString("es-ES", {
    weekday: "long",
  });
  const endWeekday = festival.endDate.toLocaleString("es-ES", {
    weekday: "long",
  });
  const startDateDay = festival.startDate.getDate() + 1;
  const endDateDay = festival.endDate.getDate() + 1;
  const startDateMonth = festival.startDate.toLocaleString("es-ES", {
    month: "long",
  });

  if (withWeekday) {
    return `${startWeekday} ${startDateDay} y ${endWeekday} ${endDateDay} de ${startDateMonth}`;
  }

  return `${startDateDay} y ${endDateDay} de ${startDateMonth}`;
}

export function profileHasReservation(
  profile: ProfileType | ProfileWithParticipationsAndRequests,
  festivalId: number,
) {
  return profile?.participations?.some((participation) => {
    return participation?.reservation?.festivalId === festivalId;
  });
}
export function getSearchArtistOptions(
  festival: FestivalWithUserRequests,
  profile: ProfileType,
): SearchOption[] {
  const festivalArtists = festival.userRequests.map((request) => request.user);
  const filteredArtists = festivalArtists.filter((artist) => {
    return (
      !profileHasReservation(artist, festival.id) &&
      isProfileInFestival(festival.id, artist) &&
      artist.category === "illustration"
    );
  });

  return getParticipantsOptions(filteredArtists);
}
