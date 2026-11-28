import ActivityDetails from "@/app/components/festivals/festival_activities/admin-activity-details";
import PageBreadcrumbs from "@/app/components/navbar/page-breadcrumbs";
import { Badge } from "@/app/components/ui/badge";
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
        <div className="flex flex-wrap items-center gap-2">
          <h1
            className="min-w-0 break-words text-2xl font-bold leading-tight"
            data-installed-title=""
          >
            {activity.name}
          </h1>
          {!activity.isVisible && <Badge variant="amber">Borrador</Badge>}
        </div>
        {!activity.isVisible && (
          <p className="text-sm text-muted-foreground">
            Borrador: solo el equipo puede ver esta actividad. Publicala para
            que los participantes puedan verla e inscribirse.
          </p>
        )}
      </div>
      <ActivityDetails activity={activity} />
    </div>
  );
}
