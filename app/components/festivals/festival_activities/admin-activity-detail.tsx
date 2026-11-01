import ActivityDetails from "@/app/components/festivals/festival_activities/admin-activity-details";
import PageBreadcrumbs from "@/app/components/navbar/page-breadcrumbs";
import { ScreenTitle } from "@/app/components/navbar/screen-bar";
import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";

type AdminActivityDetailProps = {
  activity: FestivalActivityWithDetailsAndParticipants;
  festivalId: number;
  /** For the breadcrumb's festival level. */
  festivalName?: string;
};

export default function AdminActivityDetail({
  activity,
  festivalId,
  festivalName,
}: AdminActivityDetailProps) {
  return (
    <div className="container p-4 md:p-6 space-y-4">
      {/* The installed app's top bar carries back and the activity's name. */}
      <ScreenTitle title={activity.name} />
      <div className="space-y-1">
        <PageBreadcrumbs
          labels={
            festivalName
              ? { [`/dashboard/festivals/${festivalId}`]: festivalName }
              : undefined
          }
        />
        <h1
          className="text-2xl font-bold leading-tight"
          data-installed-title=""
        >
          {activity.name}
        </h1>
      </div>
      <ActivityDetails activity={activity} />
    </div>
  );
}
