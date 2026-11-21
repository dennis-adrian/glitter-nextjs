import { Badge } from "@/app/components/ui/badge";
import { VOLUNTEER_STATUS_LABELS } from "@/app/lib/volunteers/admin-definitions";
import type { VolunteerApplicationStatus } from "@/app/lib/volunteers/definitions";

const VARIANTS = {
  pending: "amber",
  accepted: "green",
  waitlist: "outline",
  rejected: "red",
} as const satisfies Record<VolunteerApplicationStatus, string>;

/** An application's status as a pill: "Pendiente", "Aceptada"... */
export default function VolunteerStatusBadge({
  status,
  className,
}: {
  status: VolunteerApplicationStatus;
  className?: string;
}) {
  return (
    <Badge variant={VARIANTS[status]} className={className}>
      {VOLUNTEER_STATUS_LABELS[status]}
    </Badge>
  );
}
