"use client";

import { ArrowLeftIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Progress } from "@/app/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import {
  CoverageBadge,
  SectionHeading,
} from "@/app/components/volunteers/admin/tasks/application-sections";
import { rolesMissing } from "@/app/components/volunteers/admin/tasks/assign-shift-list";
import ChoiceRow from "@/app/components/volunteers/admin/tasks/choice-row";
import { VolunteerStrip } from "@/app/components/volunteers/admin/tasks/task-header";
import { cn } from "@/app/lib/utils";
import {
  assignVolunteersToShift,
  unassignVolunteerShift,
} from "@/app/lib/volunteers/admin-actions";
import {
  defaultAssignedRoleId,
  type VolunteerShiftCandidate,
  type VolunteerShiftDetail,
} from "@/app/lib/volunteers/admin-definitions";
import type {
  VolunteerTaskCall,
  VolunteerTaskShift,
} from "@/app/lib/volunteers/admin-task-queries";
import {
  coveragePercent,
  plural,
  volunteerPersonHref,
} from "@/app/lib/volunteers/admin-tasks";
import { VOLUNTEER_MAX_SHIFTS_PER_DAY } from "@/app/lib/volunteers/definitions";
import { formatShiftWhen } from "@/app/lib/volunteers/format";

const byName = new Intl.Collator("es", { sensitivity: "base" });

function CandidateLine({ candidate }: { candidate: VolunteerShiftCandidate }) {
  const role = candidate.assignedRoleName ?? candidate.firstChoiceRoleName;
  if (candidate.shiftsThatDay === 0) {
    return <span className="text-muted-foreground">Sin turnos este día</span>;
  }
  const held = `ya tiene ${plural(candidate.shiftsThatDay, "turno", "turnos")} este día`;
  if (candidate.shiftsThatDay >= VOLUNTEER_MAX_SHIFTS_PER_DAY) {
    return (
      <span className="flex items-start gap-1.5 text-amber-900 dark:text-amber-200">
        <TriangleAlertIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0"
        />
        <span className="min-w-0">
          {role} · {held}. Podés sumarla igual.
        </span>
      </span>
    );
  }
  return (
    <span className="text-muted-foreground">
      {role} · {held}
    </span>
  );
}

/**
 * One shift, to add people to it: how full it is, who is assigned (by
 * role, each with "Quitar"), and the accepted people who marked it, to pick
 * several and assign them at once, each with a role that starts at their
 * current one or their 1st choice.
 */
export default function VolunteerShiftAssignScreen({
  festivalId,
  detail,
  shift,
  roles,
  backHref,
  reviewHref,
}: {
  festivalId: number;
  detail: VolunteerShiftDetail;
  /** The shift as the Asignar list counts it. */
  shift: VolunteerTaskShift;
  roles: VolunteerTaskCall["roles"];
  backHref: string;
  /** Revisar, for "Revisarlas". */
  reviewHref: string;
}) {
  const router = useRouter();
  const [showAssigned, setShowAssigned] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const activeRoleIds = new Set(
    roles.filter((role) => role.isActive).map((role) => role.id),
  );
  const accepted = detail.candidates.filter(
    (candidate) => candidate.status === "accepted",
  );
  const pending = detail.candidates.filter(
    (candidate) => candidate.status === "pending",
  ).length;

  const initialRole = (candidate: VolunteerShiftCandidate) =>
    candidate.assignedRoleId ?? defaultAssignedRoleId(candidate, activeRoleIds);
  const [chosen, setChosen] = useState<Map<number, number | null>>(
    () => new Map(),
  );

  const toggle = (candidate: VolunteerShiftCandidate, checked: boolean) =>
    setChosen((current) => {
      const next = new Map(current);
      if (checked) next.set(candidate.applicationId, initialRole(candidate));
      else next.delete(candidate.applicationId);
      return next;
    });
  const setRole = (applicationId: number, roleId: number) =>
    setChosen((current) => new Map(current).set(applicationId, roleId));

  const assign = () =>
    startSaving(async () => {
      const result = await assignVolunteersToShift({
        festivalId,
        shiftId: shift.id,
        people: [...chosen.entries()].map(([applicationId, roleId]) => ({
          applicationId,
          roleId,
        })),
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      if (result.warning) toast.warning(result.warning);
      else toast.success(result.message);
      setChosen(new Map());
      router.refresh();
    });

  const unassign = (applicationId: number) =>
    startSaving(async () => {
      const result = await unassignVolunteerShift({
        festivalId,
        shiftId: shift.id,
        applicationId,
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.refresh();
    });

  const assignedCount = detail.shift.assignedCount;
  const needed = detail.shift.neededHeadcount;
  const coverageLabel = `${assignedCount} de ${needed} asignados`;
  const after = assignedCount + chosen.size;

  // Assigned people by role, roles in their order; no role last.
  const groups = new Map<string, typeof detail.assignees>();
  const roleOrder = new Map(roles.map((role, index) => [role.name, index]));
  for (const assignee of detail.assignees) {
    const key = assignee.assignedRoleName ?? "Sin rol";
    groups.set(key, [...(groups.get(key) ?? []), assignee]);
  }
  const groupList = [...groups.entries()].sort(
    ([a], [b]) =>
      (roleOrder.get(a) ?? Number.MAX_SAFE_INTEGER) -
        (roleOrder.get(b) ?? Number.MAX_SAFE_INTEGER) || byName.compare(a, b),
  );
  const missingRoles = rolesMissing(shift, roles);

  const roleOptions = (candidate: VolunteerShiftCandidate) => {
    const rank = (id: number) =>
      id === candidate.firstChoiceRoleId
        ? 0
        : id === candidate.secondChoiceRoleId
          ? 1
          : 2;
    return roles
      .filter((role) => role.isActive || role.id === candidate.assignedRoleId)
      .sort((a, b) => rank(a.id) - rank(b.id))
      .map((role) => ({
        id: role.id,
        label:
          role.id === candidate.firstChoiceRoleId
            ? `${role.name} (1ª)`
            : role.id === candidate.secondChoiceRoleId
              ? `${role.name} (2ª)`
              : role.name,
      }));
  };

  return (
    <div className="flex min-h-full min-w-0 flex-col lg:rounded-lg lg:border lg:bg-card">
      <div className="flex min-w-0 flex-1 flex-col gap-3 px-3 pt-2 pb-6 lg:gap-5 lg:p-6">
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center gap-1 self-start font-semibold text-primary lg:hidden"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          Asignar
        </Link>

        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1
              className="font-display text-2xl leading-8 font-bold break-words"
              data-installed-title=""
            >
              {formatShiftWhen(detail.shift)}
            </h1>
            <p className="mt-0.5 break-words text-muted-foreground">
              {detail.shift.label}
            </p>
          </div>
          <div
            aria-label="Cobertura del turno"
            className="flex min-w-0 flex-col gap-2 rounded-lg border bg-card px-4 py-3.5 shadow-xs lg:flex-[0_1_16rem] lg:gap-1.5 lg:border-0 lg:p-0 lg:shadow-none"
          >
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="font-display text-xl leading-7 font-semibold tabular-nums lg:font-sans lg:text-sm lg:leading-5">
                {coverageLabel}
              </span>
              <CoverageBadge shift={shift} />
            </div>
            {needed > 0 && (
              <Progress
                value={coveragePercent(detail.shift)}
                aria-label={coverageLabel}
              />
            )}
            {detail.assignees.length > 0 && (
              <Button
                type="button"
                variant="link"
                className="h-8 self-start px-0 lg:hidden"
                aria-expanded={showAssigned}
                aria-controls="shift-assigned"
                onClick={() => setShowAssigned((value) => !value)}
              >
                {showAssigned
                  ? "Ocultar asignados"
                  : `Ver los ${detail.assignees.length} asignados`}
              </Button>
            )}
          </div>
        </div>

        <div className="grid min-w-0 items-start gap-3 lg:grid-cols-[repeat(auto-fit,minmax(min(18.75rem,100%),1fr))] lg:gap-6">
          <section
            id="shift-assigned"
            aria-labelledby="shift-assigned-title"
            className={cn(
              "flex min-w-0 flex-col gap-3",
              !showAssigned && "max-lg:hidden",
            )}
          >
            <SectionHeading id="shift-assigned-title" as="h2">
              Asignados ({detail.assignees.length})
            </SectionHeading>
            {groupList.map(([roleName, people]) => (
              <div key={roleName} className="min-w-0">
                <p className="mb-1 break-words text-muted-foreground">
                  {roleName}
                </p>
                <ul>
                  {people.map((person) => (
                    <li
                      key={person.applicationId}
                      className="flex min-w-0 items-center justify-between gap-2 border-t py-1.5"
                    >
                      <Link
                        href={volunteerPersonHref(
                          festivalId,
                          person.applicationId,
                          { kind: "turno", shiftId: shift.id },
                        )}
                        className="min-w-0 font-semibold break-words wrap-anywhere text-primary"
                      >
                        {person.fullName}
                      </Link>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        disabled={isSaving}
                        onClick={() => unassign(person.applicationId)}
                      >
                        Quitar
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {missingRoles.length > 0 && (
              <VolunteerStrip>
                Nadie en: {missingRoles.map((role) => role.name).join(", ")}
              </VolunteerStrip>
            )}
          </section>

          <section
            aria-labelledby="shift-candidates-title"
            className="flex min-w-0 flex-col gap-2"
          >
            <SectionHeading id="shift-candidates-title" as="h2">
              Pueden cubrirlo (
              {plural(accepted.length, "aceptada", "aceptadas")})
            </SectionHeading>
            <ul className="flex flex-col gap-2">
              {accepted.map((candidate) => {
                const checked = chosen.has(candidate.applicationId);
                const roleId = chosen.get(candidate.applicationId) ?? null;
                return (
                  <li key={candidate.applicationId}>
                    <ChoiceRow
                      id={`shift-candidate-${candidate.applicationId}`}
                      checked={checked}
                      disabled={!detail.shift.isActive}
                      onCheckedChange={(value) => toggle(candidate, value)}
                      label={candidate.fullName}
                      below={
                        checked && (
                          <Select
                            value={roleId === null ? undefined : String(roleId)}
                            onValueChange={(value) =>
                              setRole(candidate.applicationId, Number(value))
                            }
                          >
                            <SelectTrigger
                              aria-label={`Rol de ${candidate.fullName}`}
                              className="h-auto min-h-10 w-full text-left whitespace-normal"
                            >
                              <SelectValue placeholder="Elegí un rol" />
                            </SelectTrigger>
                            <SelectContent>
                              {roleOptions(candidate).map((option) => (
                                <SelectItem
                                  key={option.id}
                                  value={String(option.id)}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )
                      }
                    >
                      <span className="flex flex-col gap-1">
                        <strong className="font-semibold wrap-anywhere">
                          {candidate.fullName}
                        </strong>
                        <CandidateLine candidate={candidate} />
                      </span>
                    </ChoiceRow>
                  </li>
                );
              })}
            </ul>
            {accepted.length === 0 && (
              <p className="text-muted-foreground">
                Ninguna aceptada lo marcó.
              </p>
            )}
            {pending > 0 && (
              <VolunteerStrip>
                Hay{" "}
                <strong className="font-semibold">
                  {plural(pending, "pendiente", "pendientes")}
                </strong>{" "}
                {pending === 1 ? "que marcó" : "que marcaron"} este turno.{" "}
                <Link href={reviewHref} className="font-semibold text-primary">
                  {pending === 1 ? "Revisarla" : "Revisarlas"}
                </Link>
              </VolunteerStrip>
            )}
          </section>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex flex-col gap-1.5 border-t bg-card px-3 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgb(0_0_0/0.06)] lg:static lg:flex-row lg:flex-wrap lg:items-center lg:justify-end lg:gap-4 lg:px-6 lg:py-4 lg:shadow-none">
        {needed > 0 && (
          <span className="text-center text-muted-foreground">
            Quedaría en {after} de {needed}
          </span>
        )}
        <Button
          type="button"
          size="lg"
          wrap
          className="w-full lg:h-10 lg:min-h-10 lg:w-auto lg:text-sm"
          disabled={isSaving || chosen.size === 0 || !detail.shift.isActive}
          onClick={assign}
        >
          {chosen.size === 1
            ? "Asignar 1 persona"
            : `Asignar ${chosen.size} personas`}
        </Button>
      </div>
    </div>
  );
}
