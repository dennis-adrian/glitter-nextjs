"use client";

import {
  ChevronRightIcon,
  EllipsisVerticalIcon,
  MailIcon,
  PhoneIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { ParticipantProfile } from "@/app/lib/participants/definitions";
import SocialMediaBadge from "@/app/components/social-media-badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/app/components/ui/accordion";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import ActivityDateCell from "@/app/components/users/cells/activity-date-cell";
import ProfileStatusCell from "@/app/components/users/cells/profile-status";
import ProfileCategoryBadge from "@/app/components/user_profile/category-badge";
import {
  participantEligibleSurfaceClass,
  PauseEligibilityNotice,
} from "@/app/components/users/participant-pause-eligibility";
import ProfileQuickActions from "@/app/components/user_profile/public_profile/quick-actions";
import { ScrollArea, ScrollBar } from "@/app/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Props = {
  participant: ParticipantProfile;
};

export default function ParticipantMobileCard({ participant }: Props) {
  const { prefetch } = useRouter();
  const profileHref = `/dashboard/users/${participant.id}`;
  const handlePrefetchProfile = useCallback(() => {
    prefetch(profileHref);
  }, [prefetch, profileHref]);

  const socialsWithUsername =
    participant.userSocials?.filter((social) => social.username) ?? [];

  const isPauseEligible = participant.activitySummary.isPauseEligible;

  return (
    <div
      className={cn(
        "rounded-md border bg-card shadow-sm overflow-hidden",
        participantEligibleSurfaceClass(isPauseEligible),
      )}
    >
      <div className="border-b border-inherit p-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <ProfileCategoryBadge profile={participant} />
          <ProfileStatusCell
            className="text-xs gap-1"
            status={participant.status}
          />
        </div>
        <Link
          href={profileHref}
          prefetch
          className="flex shrink-0 items-center gap-1 text-muted-foreground"
          onMouseEnter={handlePrefetchProfile}
          onTouchStart={handlePrefetchProfile}
          onFocus={handlePrefetchProfile}
        >
          <span className="sr-only">Ver perfil</span>
          <ChevronRightIcon className="h-4 w-4" />
        </Link>
      </div>

      <div className="flex items-start justify-between gap-2 p-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar className="h-10 w-10 shrink-0 border-2 border-muted-foreground/20">
            <AvatarImage
              src={participant.imageUrl ?? undefined}
              alt={participant.displayName || "Imagen de perfil"}
            />
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              <span className="text-muted-foreground">#{participant.id}</span>{" "}
              {participant.displayName}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {[participant.firstName, participant.lastName]
                .filter(Boolean)
                .join(" ") || "Sin nombre"}
            </p>
            {isPauseEligible ? (
              <PauseEligibilityNotice className="mt-1.5" />
            ) : null}
          </div>
        </div>
        <ProfileQuickActions
          profile={participant}
          activitySummary={participant.activitySummary}
          hideViewProfile
          triggerVariant="ghost"
          triggerSize="icon"
          triggerClassName="h-8 w-8 shrink-0 p-0"
        >
          <>
            <span className="sr-only">Abrir menú de acciones</span>
            <EllipsisVerticalIcon className="h-4 w-4" />
          </>
        </ProfileQuickActions>
      </div>

      {socialsWithUsername.length > 0 && (
        <div className="px-3 pb-2">
          <p className="mb-1 px-1 text-[10px] font-semibold uppercase text-muted-foreground">
            Redes
          </p>
          <ScrollArea className="whitespace-nowrap">
            <div className="flex gap-1 px-1 pb-1">
              {participant.phoneNumber && (
                <SocialMediaBadge
                  socialMediaType="whatsapp"
                  username={participant.phoneNumber}
                />
              )}
              {socialsWithUsername.map((social) => (
                <SocialMediaBadge
                  key={social.id}
                  socialMediaType={social.type}
                  username={social.username}
                />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      )}

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem
          value={`participant-${participant.id}`}
          className="border-b-0"
        >
          <AccordionTrigger className="border-t px-3 py-2 text-xs font-medium uppercase [&[data-state=closed]_.label-open]:hidden [&[data-state=open]_.label-closed]:hidden">
            <span className="label-closed">Ver más</span>
            <span className="label-open">Ver menos</span>
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-4 px-3 pb-3 text-sm">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                Contacto
              </p>
              <div className="flex flex-col gap-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <MailIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{participant.email}</span>
                </div>
                {participant.phoneNumber && (
                  <div className="flex items-center gap-2">
                    <PhoneIcon className="h-4 w-4 shrink-0" />
                    <SocialMediaBadge
                      socialMediaType="whatsapp"
                      username={participant.phoneNumber}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                Actividad
              </p>
              <div className="space-y-3">
                <div>
                  <p className="mb-0.5 text-xs font-medium text-muted-foreground">
                    Última participación
                  </p>
                  <ActivityDateCell
                    date={participant.activitySummary.lastParticipationAt}
                    festivalName={
                      participant.activitySummary.lastParticipationFestivalName
                    }
                    emptyLabel="Nunca participó"
                    sourceLabel="Reserva aceptada"
                    exactDateStyle="date"
                  />
                </div>
                <div>
                  <p className="mb-0.5 text-xs font-medium text-muted-foreground">
                    Última aceptación de términos
                  </p>
                  <ActivityDateCell
                    date={participant.activitySummary.lastTermsAcceptedAt}
                    festivalName={
                      participant.activitySummary.lastTermsAcceptedFestivalName
                    }
                    emptyLabel="Nunca aceptó términos"
                    sourceLabel="Términos aceptados"
                  />
                </div>
                <div>
                  <p className="mb-0.5 text-xs font-medium text-muted-foreground">
                    Participaciones
                  </p>
                  <p>
                    {participant.activitySummary.acceptedParticipationsCount}
                  </p>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
