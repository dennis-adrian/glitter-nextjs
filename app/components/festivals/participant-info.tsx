import type { StandBase } from "@/app/api/stands/definitions";
import type { UserCategory } from "@/app/api/users/definitions";
import ProfileAvatar from "@/app/components/common/profile-avatar";
import { Badge, type BadgeVariant } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { getPublicCategoryLabel } from "@/app/lib/maps/helpers";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import { isNewProfile } from "@/app/lib/utils";
import Link from "next/link";

export type PublicFestivalParticipant = {
  id: number;
  displayName: string;
  imageUrl: string | null;
  category: UserCategory;
  stands: Pick<StandBase, "id" | "label" | "standNumber">[];
  hasStamp: boolean;
  isNew: boolean;
};

export function toPublicFestivalParticipant(
  participant: {
    id: number;
    displayName: string | null;
    imageUrl: string | null;
    category: UserCategory;
    stands: Pick<StandBase, "id" | "label" | "standNumber">[];
    participations: {
      hasStamp: boolean;
      reservation: { festivalId: number; status: string };
    }[];
  },
  festivalId: number,
): PublicFestivalParticipant {
  return {
    id: participant.id,
    displayName: participant.displayName || "Participante",
    imageUrl: participant.imageUrl,
    category: participant.category,
    stands: participant.stands.map((stand) => ({
      id: stand.id,
      label: stand.label,
      standNumber: stand.standNumber,
    })),
    hasStamp: participant.participations.some(
      (participation) =>
        participation.reservation.festivalId === festivalId &&
        participation.hasStamp,
    ),
    isNew: isNewProfile({ participations: participant.participations }),
  };
}

type ParticipantInfoProps = {
  profile: PublicFestivalParticipant;
};

export default function ParticipantInfo(props: ParticipantInfoProps) {
  const standsLabel = props.profile.stands
    .map((stand) => formatStandLabel(stand))
    .join(" - ");
  const category = props.profile.category;
  const categoryText = getPublicCategoryLabel(category);
  const categoryVariant: BadgeVariant =
    category === "illustration" || category === "new_artist"
      ? "illustration"
      : category === "entrepreneurship"
        ? "entrepreneurship"
        : category === "gastronomy"
          ? "gastronomy"
          : "outline";

  return (
    <article className="flex min-h-64 flex-col items-center rounded-2xl border border-primary-100 bg-card p-4 text-center transition hover:border-primary-300 hover:shadow-md">
      <ProfileAvatar
        showGlitterStamp={props.profile.hasStamp}
        isNew={props.profile.isNew}
        profile={props.profile}
        className="size-18"
      />
      <div className="mt-4 flex flex-1 flex-col items-center">
        <h3 className="line-clamp-2 font-space-grotesk font-bold leading-tight">
          {props.profile.displayName}
        </h3>
        {categoryText ? (
          <Badge className="mt-2" variant={categoryVariant} size="sm">
            {categoryText}
          </Badge>
        ) : null}
        <p className="mt-3 text-xs font-medium text-muted-foreground">
          {standsLabel ? `Stand ${standsLabel}` : "Stand por confirmar"}
        </p>
      </div>
      <Button asChild variant="link" size="sm" className="mt-3">
        <Link href={`/public_profiles/${props.profile.id}`}>Ver perfil</Link>
      </Button>
    </article>
  );
}
