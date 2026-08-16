import {
  ReservationWithParticipantsAndUsers,
  ExternalParticipant,
} from "@/app/api/reservations/definitions";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { UserCategory, UserSocial } from "@/app/api/users/definitions";
import { getExternalParticipantCategoryLabel } from "@/app/lib/external_participants/definitions";

type BaseMapParticipant = {
  id: string;
  displayName: string;
  imageUrl: string | null;
  userSocials: UserSocial[];
  links: { label: string; href: string }[];
  /** What this participant makes or sells — empty when none are recorded. */
  subcategories: string[];
};

export type UserMapParticipant = BaseMapParticipant & {
  kind: "user";
  categoryLabel: UserCategory;
  userId: number;
};

export type ExternalMapParticipant = BaseMapParticipant & {
  kind: "external";
  categoryLabel: string;
};

export type MapParticipant = UserMapParticipant | ExternalMapParticipant;

export function getActiveStandReservations(
  stand: StandWithReservationsWithParticipants,
): ReservationWithParticipantsAndUsers[] {
  return stand.reservations?.filter((r) => r.status !== "rejected") ?? [];
}

export function hasExternalParticipants(
  stand: StandWithReservationsWithParticipants,
) {
  return getActiveStandReservations(stand).some(
    (reservation) => (reservation.externalParticipants?.length ?? 0) > 0,
  );
}

/** Whether any user participating in the stand belongs to the given set */
export function hasActivityParticipant(
  stand: StandWithReservationsWithParticipants,
  userIdSet: Set<number>,
): boolean {
  return getActiveStandReservations(stand)
    .flatMap((reservation) => reservation.participants)
    .some((participant) => userIdSet.has(participant.user.id));
}

export function getStandMapParticipants(
  stand: StandWithReservationsWithParticipants,
): MapParticipant[] {
  return getActiveStandReservations(stand).flatMap((reservation) => {
    const userParticipants = reservation.participants.map((participant) => ({
      id: `user-${participant.id}`,
      kind: "user" as const,
      displayName: participant.user.displayName ?? "Participante",
      imageUrl: participant.user.imageUrl,
      categoryLabel: participant.user.category,
      userId: participant.user.id,
      userSocials: participant.user.userSocials ?? [],
      // Registered users carry their contact details in userSocials, which the
      // cards render as icon rows. `links` is the external-participant path;
      // deriving it from the socials here made every card list the same
      // accounts twice, under two "Contacto" headings.
      links: [],
      subcategories: (participant.user.profileSubcategories ?? []).map(
        (profileSubcategory) => profileSubcategory.subcategory.label,
      ),
    }));

    const externalParticipants =
      reservation.externalParticipants?.map(({ externalParticipant }) =>
        mapExternalParticipant(externalParticipant),
      ) ?? [];

    return [...userParticipants, ...externalParticipants];
  });
}

function mapExternalParticipant(
  participant: ExternalParticipant,
): MapParticipant {
  const links = [
    participant.websiteUrl
      ? { label: "Sitio web", href: participant.websiteUrl }
      : null,
    participant.instagramUrl
      ? { label: "Instagram", href: participant.instagramUrl }
      : null,
    participant.contactEmail
      ? { label: "Correo", href: `mailto:${participant.contactEmail}` }
      : null,
  ].filter((link): link is { label: string; href: string } => link !== null);

  return {
    id: `external-${participant.id}`,
    kind: "external",
    displayName: participant.displayName,
    imageUrl: participant.imageUrl,
    categoryLabel: getExternalParticipantCategoryLabel(participant),
    userSocials: [],
    links,
    subcategories: [],
  };
}
