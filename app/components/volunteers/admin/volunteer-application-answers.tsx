import { CheckIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/app/components/ui/badge";
import {
  VOLUNTEER_EXPERIENCE_ADMIN_LABELS,
  type VolunteerAdminRole,
  type VolunteerAdminShift,
  type VolunteerApplicationDetail,
} from "@/app/lib/volunteers/admin-definitions";
import {
  compareShiftsByStart,
  formatShiftWhen,
} from "@/app/lib/volunteers/format";

function roleName(roles: VolunteerAdminRole[], id: number) {
  const role = roles.find((candidate) => candidate.id === id);
  if (!role) return `Rol #${id}`;
  return role.isActive ? role.name : `${role.name} (inactivo)`;
}

function experienceLabel(value: string) {
  return (
    VOLUNTEER_EXPERIENCE_ADMIN_LABELS[
      value as keyof typeof VOLUNTEER_EXPERIENCE_ADMIN_LABELS
    ] ?? value
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-sm text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

/** A badge whose long role name wraps instead of running out of the card. */
const wrappingBadge = "max-w-full whitespace-normal break-words";

/**
 * The "Lo que eligió" card's body: the roles and shifts the applicant chose,
 * their experience and why they want to volunteer.
 */
export default function VolunteerApplicationAnswers({
  application,
  roles,
  shifts,
}: {
  application: Pick<
    VolunteerApplicationDetail,
    | "firstChoiceRoleId"
    | "secondChoiceRoleId"
    | "availableShiftIds"
    | "experience"
    | "experienceNotes"
    | "motivation"
  >;
  roles: VolunteerAdminRole[];
  shifts: VolunteerAdminShift[];
}) {
  const available = shifts
    .filter((shift) => application.availableShiftIds.includes(shift.id))
    .sort(compareShiftsByStart);
  // "N de M" counts active shifts only; inactive ones they marked stay listed.
  const activeCount = shifts.filter((shift) => shift.isActive).length;
  const availableActiveCount = available.filter(
    (shift) => shift.isActive,
  ).length;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Block title="Roles preferidos">
        <div className="flex min-w-0 flex-wrap gap-2">
          <Badge size="lg" className={wrappingBadge}>
            1ª {roleName(roles, application.firstChoiceRoleId)}
          </Badge>
          <Badge size="lg" variant="outline" className={wrappingBadge}>
            2ª {roleName(roles, application.secondChoiceRoleId)}
          </Badge>
        </div>
      </Block>

      <Block
        title={`Turnos disponibles (${availableActiveCount} de ${activeCount})`}
      >
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">No marcó turnos.</p>
        ) : (
          <ul className="flex min-w-0 flex-col gap-1.5">
            {available.map((shift) => (
              <li key={shift.id} className="flex min-w-0 items-start gap-2">
                <CheckIcon
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                />
                <span className="min-w-0 text-sm break-words">
                  <strong className="font-semibold tabular-nums">
                    {formatShiftWhen(shift)}
                  </strong>
                  {" — "}
                  {shift.label}
                  {!shift.isActive && (
                    <span className="text-muted-foreground"> (inactivo)</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Experiencia y habilidades">
        {application.experience.length === 0 ? (
          <p className="text-sm text-muted-foreground">No marcó ninguna.</p>
        ) : (
          <ul className="flex min-w-0 flex-wrap gap-2">
            {application.experience.map((value) => (
              <li key={value} className="min-w-0 max-w-full">
                <Badge variant="outline" className={wrappingBadge}>
                  {experienceLabel(value)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {application.experienceNotes && (
          <p className="text-sm break-words whitespace-pre-line">
            {application.experienceNotes}
          </p>
        )}
      </Block>

      <Block title="¿Por qué quiere ser voluntario/a?">
        <p className="rounded-md bg-muted px-4 py-3 text-sm break-words whitespace-pre-line">
          {application.motivation}
        </p>
      </Block>
    </div>
  );
}
