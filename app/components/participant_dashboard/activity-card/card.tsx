"use client";

import { BaseProfile } from "@/app/api/users/definitions";
import useActivityRegistration from "@/app/hooks/use-activity-registration";
import { Card, CardContent } from "@/app/components/ui/card";
import Heading from "@/app/components/atoms/heading";
import ActivityCardActions from "@/app/components/participant_dashboard/activity-card/activity-card-actions";
import EnrolledBadge from "@/app/components/participant_dashboard/activity-card/enrolled-badge";
import {
  getActivityTheme,
  getEnrolledConfig,
  getEnrollmentInfo,
  isActivityInVotingWindow,
} from "@/app/components/participant_dashboard/activity-card/utils";
import type { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";

interface FestivalActivityCardProps {
  activity: FestivalActivityWithDetailsAndParticipants;
  forProfile: BaseProfile;
}

export default function FestivalActivityCard({
  activity,
  forProfile,
}: FestivalActivityCardProps) {
  const theme = getActivityTheme();
  const enrollment = getEnrollmentInfo(activity, forProfile.id);
  const enrolledConfig = enrollment.isEnrolled
    ? getEnrolledConfig(activity, forProfile.id, enrollment.proofDisplayState)
    : null;
  const isInVotingWindow =
    activity.allowsVoting && isActivityInVotingWindow(activity);
  const registration = useActivityRegistration(
    activity.registrationStartDate,
    activity.registrationEndDate,
  );
  const activityHref = `/profiles/${forProfile.id}/festivals/${activity.festivalId}/activity/${activity.id}`;

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-2.5 p-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Heading
              level={3}
              className="text-lg md:text-lg lg:text-lg leading-snug"
            >
              {activity.name}
            </Heading>
            {enrollment.isEnrolled && !enrollment.isRemoved && (
              <EnrolledBadge proofDisplayState={enrollment.proofDisplayState} />
            )}
          </div>
          {activity.description && (
            <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {activity.description}
            </p>
          )}
        </div>

        <div className="mt-auto flex flex-col gap-2">
          <ActivityCardActions
            activity={activity}
            forProfile={forProfile}
            theme={theme}
            enrollment={enrollment}
            enrolledConfig={enrolledConfig}
            activityHref={activityHref}
            isInVotingWindow={isInVotingWindow}
            enrollmentIsOpen={registration.isOpen}
            enrollmentIsUpcoming={registration.status === "upcoming"}
          />
        </div>
      </CardContent>
    </Card>
  );
}
