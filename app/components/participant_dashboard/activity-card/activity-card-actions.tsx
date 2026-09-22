import Link from "next/link";

import { ChevronRight, Hourglass, VoteIcon } from "lucide-react";

import { BaseProfile } from "@/app/api/users/definitions";
import DeadlineStamp from "@/app/components/participant_dashboard/activity-card/deadline-stamp";
import EnrolledUsersCta from "@/app/components/participant_dashboard/activity-card/enrolled-users-cta";
import PendingActionNotice from "@/app/components/participant_dashboard/activity-card/pending-action-notice";
import {
  ActivityTheme,
  EnrolledConfig,
} from "@/app/components/participant_dashboard/activity-card/types";
import { getEnrollmentInfo } from "@/app/components/participant_dashboard/activity-card/utils";
import { Button } from "@/app/components/ui/button";
import { getMaterialConfig } from "@/app/lib/festival_activites/helpers";
import type {
  FestivalActivityWithDetailsAndParticipants,
  WaitlistEntryWithUser,
} from "@/app/lib/festivals/definitions";

type EnrollmentInfo = ReturnType<typeof getEnrollmentInfo>;
type EnrolledInfo = Extract<EnrollmentInfo, { isEnrolled: true }>;
type UnenrolledInfo = Extract<EnrollmentInfo, { isEnrolled: false }>;

type ActivityCardActionsProps = {
  activity: FestivalActivityWithDetailsAndParticipants;
  forProfile: BaseProfile;
  theme: ActivityTheme;
  enrollment: EnrollmentInfo;
  enrolledConfig: EnrolledConfig | null;
  activityHref: string;
  isInVotingWindow: boolean;
  enrollmentIsOpen: boolean;
  enrollmentIsUpcoming?: boolean;
};

function RemovedNotice({
  activityHref,
  theme,
}: {
  activityHref: string;
  theme: ActivityTheme;
}) {
  return (
    <>
      <div className="rounded-lg border p-3 text-red-700 bg-red-50 border-red-200">
        <p className="text-xs">
          No podés volver a inscribirte en esta actividad
        </p>
      </div>
      <Link
        href={activityHref}
        className="flex items-center justify-center gap-1 text-sm font-semibold transition-opacity hover:opacity-80"
        style={{ color: theme.accentText }}
      >
        Ver detalles
        <ChevronRight className="w-4 h-4" />
      </Link>
    </>
  );
}

function EnrolledActions({
  activity,
  forProfile,
  theme,
  enrollment,
  enrolledConfig,
}: {
  activity: FestivalActivityWithDetailsAndParticipants;
  forProfile: BaseProfile;
  theme: ActivityTheme;
  enrollment: EnrolledInfo;
  enrolledConfig: EnrolledConfig;
}) {
  const material = getMaterialConfig(activity.type);

  return (
    <>
      {enrollment.proofDisplayState === "pending_review" && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Estamos revisando tu {material.label}.
        </p>
      )}
      {enrollment.proofDisplayState === "approved" && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Tu {material.label} fue {material.pastParticiple} para el festival.
        </p>
      )}
      {enrolledConfig.isPending && (
        <PendingActionNotice enrolledConfig={enrolledConfig} />
      )}

      {enrolledConfig.ctaType === "link" && enrolledConfig.deadlineDate && (
        <DeadlineStamp
          theme={theme}
          label="Hasta:"
          date={enrolledConfig.deadlineDate}
        />
      )}

      <EnrolledUsersCta
        enrolledConfig={enrolledConfig}
        participationId={enrollment.participationId}
        festivalId={activity.festivalId}
        activityId={activity.id}
        forProfile={forProfile}
        theme={theme}
        proofType={activity.proofType}
        proofDisplayState={enrollment.proofDisplayState}
        adminFeedback={enrollment.adminFeedback}
        existingPromoHighlight={enrollment.existingPromoHighlight}
        existingPromoDescription={enrollment.existingPromoDescription}
        existingPromoConditions={enrollment.existingPromoConditions}
      />
    </>
  );
}

function WaitlistStatusBadge({
  waitlistEntry,
  hasActiveInvite = false,
}: {
  waitlistEntry: WaitlistEntryWithUser;
  hasActiveInvite?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-sm rounded-md border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2">
      <Hourglass className="w-3 h-3 shrink-0" />
      {hasActiveInvite ? (
        <p className="font-medium">¡Tenés un cupo disponible!</p>
      ) : (
        <p>
          Estás en la lista de espera en la posición{" "}
          <strong>#{waitlistEntry.position}</strong>
        </p>
      )}
    </div>
  );
}

function UnenrolledCta({
  theme,
  activityHref,
  isInVotingWindow,
  enrollmentIsOpen,
  waitlistEntry,
}: {
  theme: ActivityTheme;
  activityHref: string;
  isInVotingWindow: boolean;
  enrollmentIsOpen: boolean;
  waitlistEntry: WaitlistEntryWithUser | null;
}) {
  if (isInVotingWindow) {
    return (
      <Button className="w-full" size="sm" asChild>
        <Link href={`${activityHref}/voting`}>
          <VoteIcon className="w-5 h-5 mr-1" />
          Votar ahora
        </Link>
      </Button>
    );
  }

  if (!waitlistEntry && enrollmentIsOpen) {
    return (
      <Button
        className="w-full"
        style={{
          backgroundColor: theme.buttonBg,
          color: theme.buttonText,
        }}
        size="sm"
        asChild
      >
        <Link href={activityHref}>
          Participar
          <ChevronRight className="w-5 h-5 ml-1" />
        </Link>
      </Button>
    );
  }

  return (
    <Link
      href={activityHref}
      className="inline-flex min-h-8 shrink-0 items-center gap-0.5 rounded-md text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      Ver detalles
      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

function UnenrolledActions({
  activity,
  theme,
  enrollment,
  activityHref,
  isInVotingWindow,
  enrollmentIsOpen,
  enrollmentIsUpcoming,
}: {
  activity: FestivalActivityWithDetailsAndParticipants;
  theme: ActivityTheme;
  enrollment: UnenrolledInfo;
  activityHref: string;
  isInVotingWindow: boolean;
  enrollmentIsOpen: boolean;
  enrollmentIsUpcoming?: boolean;
}) {
  const { waitlistEntry } = enrollment;
  const hasActiveInvite =
    waitlistEntry?.notifiedAt &&
    waitlistEntry.notifiedForDetailId &&
    waitlistEntry.expiresAt &&
    new Date() < new Date(waitlistEntry.expiresAt);

  // An invitation has its own deadline, independent of general registration.
  if (hasActiveInvite) {
    return (
      <>
        <WaitlistStatusBadge waitlistEntry={waitlistEntry} hasActiveInvite />
        <DeadlineStamp
          theme={theme}
          label="Inscribite hasta:"
          date={waitlistEntry.expiresAt!}
        />
        <Button className="w-full" size="sm" asChild>
          <Link href={activityHref}>
            Inscribirme ahora
            <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </>
    );
  }

  return (
    <>
      {enrollmentIsUpcoming && (
        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Inscripciones próximamente
            </p>
            <DeadlineStamp
              theme={theme}
              label="Desde:"
              date={activity.registrationStartDate}
            />
          </div>
          <UnenrolledCta
            theme={theme}
            activityHref={activityHref}
            isInVotingWindow={isInVotingWindow}
            enrollmentIsOpen={enrollmentIsOpen}
            waitlistEntry={enrollment.waitlistEntry}
          />
        </div>
      )}
      {!enrollmentIsUpcoming && activity.registrationEndDate && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            {enrollmentIsOpen
              ? "Inscripciones abiertas"
              : "Inscripciones cerradas"}
          </p>
          <DeadlineStamp
            theme={theme}
            label={enrollmentIsOpen ? "Hasta:" : "Finalizaron:"}
            date={activity.registrationEndDate}
          />
        </div>
      )}

      {enrollment.waitlistEntry && (
        <WaitlistStatusBadge waitlistEntry={enrollment.waitlistEntry} />
      )}

      {!enrollmentIsUpcoming && (
        <UnenrolledCta
          theme={theme}
          activityHref={activityHref}
          isInVotingWindow={isInVotingWindow}
          enrollmentIsOpen={enrollmentIsOpen}
          waitlistEntry={enrollment.waitlistEntry}
        />
      )}
    </>
  );
}

/**
 * Renders the participation-state UI for an activity card: removed, enrolled,
 * or unenrolled (including waitlist + registration CTAs).
 */
export default function ActivityCardActions({
  activity,
  forProfile,
  theme,
  enrollment,
  enrolledConfig,
  activityHref,
  isInVotingWindow,
  enrollmentIsOpen,
  enrollmentIsUpcoming,
}: ActivityCardActionsProps) {
  if (enrollment.isEnrolled && enrollment.isRemoved) {
    return <RemovedNotice activityHref={activityHref} theme={theme} />;
  }

  if (enrollment.isEnrolled && enrolledConfig) {
    return (
      <EnrolledActions
        activity={activity}
        forProfile={forProfile}
        theme={theme}
        enrollment={enrollment}
        enrolledConfig={enrolledConfig}
      />
    );
  }

  if (!enrollment.isEnrolled) {
    return (
      <UnenrolledActions
        activity={activity}
        theme={theme}
        enrollment={enrollment}
        activityHref={activityHref}
        isInVotingWindow={isInVotingWindow}
        enrollmentIsOpen={enrollmentIsOpen}
        enrollmentIsUpcoming={enrollmentIsUpcoming}
      />
    );
  }

  // Enrolled but no enrolledConfig (shouldn't happen in practice).
  return null;
}
