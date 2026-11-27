import { VolunteerTaskBodySkeleton } from "@/app/components/volunteers/admin/tasks/task-layouts";
import { VolunteerTaskLoading } from "@/app/components/volunteers/admin/tasks/volunteer-task-frame";

export default function Loading() {
  return (
    <VolunteerTaskLoading>
      <VolunteerTaskBodySkeleton />
    </VolunteerTaskLoading>
  );
}
