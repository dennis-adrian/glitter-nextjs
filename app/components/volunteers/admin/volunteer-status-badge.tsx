import { Badge } from "@/app/components/ui/badge";
import { VOLUNTEER_STATUS_LABELS } from "@/app/lib/volunteers/admin-definitions";
import type { VolunteerApplicationStatus } from "@/app/lib/volunteers/definitions";

const VARIANTS = {
  pending: "amber",
  accepted: "green",
  waitlist: "secondary",
  rejected: "red",
} as const satisfies Record<VolunteerApplicationStatus, string>;

/** An application's status as a pill: "Por revisar", "Aceptada"... */
export default function VolunteerStatusBadge({
  status,
}: {
  status: VolunteerApplicationStatus;
}) {
  return (
    <Badge variant={VARIANTS[status]}>{VOLUNTEER_STATUS_LABELS[status]}</Badge>
  );
}
