"use client";

import { BaseProfile } from "@/app/api/users/definitions";
import Heading from "@/app/components/atoms/heading";
import ActivityCardActions from "@/app/components/participant_dashboard/activity-card/activity-card-actions";
import ActivityTypeBadge from "@/app/components/participant_dashboard/activity-card/activity-type-badge";
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
  index: number;
}

export default function FestivalActivityCard({
  activity,
  forProfile,
  index,
}: FestivalActivityCardProps) {
  const theme = getActivityTheme(index);
  const enrollment = getEnrollmentInfo(activity, forProfile.id);
  const enrolledConfig = enrollment.isEnrolled
    ? getEnrolledConfig(activity, forProfile.id, enrollment.proofDisplayState)
    : null;
  const isInVotingWindow =
    activity.allowsVoting && isActivityInVotingWindow(activity);
  const enrollmentIsOpen =
    !activity.registrationEndDate ||
    new Date() <= new Date(activity.registrationEndDate);
  const activityHref = `/profiles/${forProfile.id}/festivals/${activity.festivalId}/activity/${activity.id}`;

  return (
    <div
      key={activity.id}
      className="relative transition-transform duration-300 ease-out"
      style={{ transformOrigin: "center center" }}
    >
      <div
        className="relative overflow-hidden"
        style={{
          backgroundColor: theme.bg,
          border: theme.isPrimary ? "none" : `4px solid ${theme.border}`,
          clipPath:
            "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
        }}
      >
        {/* Perforations on left edge */}
        <div className="absolute left-0 top-0 bottom-0 w-4 flex flex-col justify-around items-center py-6">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: theme.border }}
            />
          ))}
        </div>

        <div className="p-6 pl-10 space-y-4">
          <div className="flex items-start gap-2 justify-between">
            <ActivityTypeBadge theme={theme} activityType={activity.type} />
            {enrollment.isEnrolled && !enrollment.isRemoved && (
              <EnrolledBadge theme={theme} />
            )}
          </div>

          <Heading
            level={3}
            className="leading-none"
            style={{ color: theme.textPrimary }}
          >
            {activity.name}
          </Heading>

          {activity.description && (
            <p
              className="text-sm leading-relaxed"
              style={{
                color: theme.textPrimary,
                opacity: 0.9,
              }}
            >
              {activity.description}
            </p>
          )}

          <ActivityCardActions
            activity={activity}
            forProfile={forProfile}
            theme={theme}
            enrollment={enrollment}
            enrolledConfig={enrolledConfig}
            activityHref={activityHref}
            isInVotingWindow={isInVotingWindow}
            enrollmentIsOpen={enrollmentIsOpen}
          />
        </div>
      </div>
    </div>
  );
}
