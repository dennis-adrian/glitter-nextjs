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
      <div className="mt-2 border-2 border-dashed p-3 text-red-600 bg-red-50 border-red-500">
        <p className="text-xs">
          No podés volver a inscribirte en esta actividad
        </p>
      </div>
      <Link
        href={activityHref}
        className="flex items-center justify-center gap-1 text-sm font-semibold transition-opacity hover:opacity-80"
        style={{ color: theme.textPrimary }}
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
  return (
    <>
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
}: {
  waitlistEntry: WaitlistEntryWithUser;
}) {
  const hasActiveInvite =
    waitlistEntry.notifiedAt &&
    waitlistEntry.expiresAt &&
    new Date() < new Date(waitlistEntry.expiresAt);

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
      <Button
        className="w-full font-bold border-0 hover:opacity-90 transition-opacity bg-amber-500 hover:bg-amber-600 text-white"
        style={{
          clipPath:
            "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))",
        }}
        size="lg"
        asChild
      >
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
        className="w-full font-bold border-0 hover:opacity-90 transition-opacity"
        style={{
          backgroundColor: theme.buttonBg,
          color: theme.buttonText,
          clipPath:
            "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))",
        }}
        size="lg"
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
      className="flex items-center justify-center gap-1 text-sm font-semibold transition-opacity hover:opacity-80"
      style={{ color: theme.textPrimary }}
    >
      Ver detalles
      <ChevronRight className="w-4 h-4" />
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
}: {
  activity: FestivalActivityWithDetailsAndParticipants;
  theme: ActivityTheme;
  enrollment: UnenrolledInfo;
  activityHref: string;
  isInVotingWindow: boolean;
  enrollmentIsOpen: boolean;
}) {
  return (
    <>
      {activity.registrationEndDate && (
        <DeadlineStamp
          theme={theme}
          label="Hasta:"
          date={activity.registrationEndDate}
        />
      )}

      {enrollment.waitlistEntry && (
        <WaitlistStatusBadge waitlistEntry={enrollment.waitlistEntry} />
      )}

      <div className="pt-2">
        <UnenrolledCta
          theme={theme}
          activityHref={activityHref}
          isInVotingWindow={isInVotingWindow}
          enrollmentIsOpen={enrollmentIsOpen}
          waitlistEntry={enrollment.waitlistEntry}
        />
      </div>
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
      />
    );
  }

  // Enrolled but no enrolledConfig (shouldn't happen in practice).
  return null;
}
