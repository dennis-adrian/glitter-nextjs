import { VolunteerSoloScreen } from "@/app/components/volunteers/admin/tasks/review-frame";
import { VolunteerTaskSkeleton } from "@/app/components/volunteers/admin/tasks/task-layouts";

export default function Loading() {
  return (
    <VolunteerSoloScreen>
      <VolunteerTaskSkeleton />
    </VolunteerSoloScreen>
  );
}
