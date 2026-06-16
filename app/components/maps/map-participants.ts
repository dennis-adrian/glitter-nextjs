import {
  ReservationWithParticipantsAndUsers,
  ExternalParticipant,
} from "@/app/api/reservations/definitions";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { UserCategory, UserSocial } from "@/app/api/users/definitions";
import { getExternalParticipantCategoryLabel } from "@/app/lib/external_participants/definitions";
import { socialsUrls } from "@/app/lib/users/utils";

type BaseMapParticipant = {
  id: string;
  displayName: string;
  imageUrl: string | null;
  userSocials: UserSocial[];
  links: { label: string; href: string }[];
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
      links: participant.user.userSocials
        .filter((social) => !!social.username)
        .map((social) => ({
          label: `@${social.username}`,
          href: `${socialsUrls[social.type]}${social.username}`,
        })),
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
  };
}
