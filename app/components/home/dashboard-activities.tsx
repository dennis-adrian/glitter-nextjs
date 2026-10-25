import Link from "next/link";

import { ChevronRightIcon } from "lucide-react";

import { getEnrollmentInfo } from "@/app/components/participant_dashboard/activity-card/utils";
import { HubPanel } from "@/app/components/participations/hub/hub-section";
import type { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import { describeActivity } from "@/app/lib/home/dashboard";

/**
 * The festival's activities as a short list, each saying where it stands
 * for the viewer. Their cards, with enrolling and uploads, live in the hub.
 */
export default function DashboardActivities({
  activities,
  profileId,
  href,
  now = new Date(),
}: {
  activities: FestivalActivityWithDetailsAndParticipants[];
  profileId: number;
  href: string;
  now?: Date;
}) {
  if (activities.length === 0) return null;

  return (
    <HubPanel className="px-4 py-1">
      <ul>
        {activities.map((activity) => (
          <li
            key={activity.id}
            className="border-b border-brand-border last:border-b-0"
          >
            <Link
              href={href}
              className="flex min-h-14 items-center gap-3 py-2 hover:text-brand-primary"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-brand-ink">
                  {activity.name}
                </span>
                <span className="truncate text-xs text-brand-neutral">
                  {describeActivity(
                    activity,
                    getEnrollmentInfo(activity, profileId).isEnrolled,
                    now,
                  )}
                </span>
              </span>
              <ChevronRightIcon
                className="size-4 shrink-0 text-brand-neutral"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </HubPanel>
  );
}
