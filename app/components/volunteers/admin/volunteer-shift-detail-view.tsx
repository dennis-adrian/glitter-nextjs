"use client";

import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import PageBreadcrumbs from "@/app/components/navbar/page-breadcrumbs";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader } from "@/app/components/ui/card";
import { volunteerCoverageHref } from "@/app/components/volunteers/admin/volunteer-admin-list-params";
import { volunteerNameLinkClass } from "@/app/components/volunteers/admin/volunteer-applications-list";
import {
  COVERAGE_BADGE_VARIANTS,
  CoverageMeter,
  assignedOf,
} from "@/app/components/volunteers/admin/volunteer-coverage-card";
import VolunteerStatusBadge from "@/app/components/volunteers/admin/volunteer-status-badge";
import { toastActionError } from "@/app/lib/errors/action-error";
import { cn } from "@/app/lib/utils";
import {
  assignVolunteerShift,
  unassignVolunteerShift,
} from "@/app/lib/volunteers/admin-actions";
import {
  VOLUNTEER_ADMIN_COPY,
  VOLUNTEER_ASSIGN_AUTO_ACCEPTS,
  VOLUNTEER_STATUS_FILTER_LABELS,
  shiftCoverageState,
  volunteerApplicationAdminPath,
  type VolunteerAdminResult,
  type VolunteerShiftCandidate,
  type VolunteerShiftDetail,
} from "@/app/lib/volunteers/admin-definitions";
import { VOLUNTEER_MAX_SHIFTS_PER_DAY } from "@/app/lib/volunteers/definitions";
import { formatShiftWhen } from "@/app/lib/volunteers/format";

/** Rows shown before "Ver los N…". */
const ASSIGNEES_SHOWN = 5;
const CANDIDATES_SHOWN = 8;

const CANDIDATE_FILTERS = ["all", "accepted", "pending", "waitlist"] as const;
type CandidateFilter = (typeof CANDIDATE_FILTERS)[number];

const CANDIDATE_FILTER_LABELS: Record<CandidateFilter, string> = {
  ...VOLUNTEER_STATUS_FILTER_LABELS,
  all: "Todos",
};

const EMPTY_CANDIDATES: Record<CandidateFilter, string> = {
  all: "Nadie más marcó este turno.",
  accepted: "No hay postulaciones aceptadas que puedan cubrirlo.",
  pending: "No hay postulaciones pendientes que puedan cubrirlo.",
  waitlist: "No hay postulaciones en espera que puedan cubrirlo.",
};

/** "29 personas marcaron este turno como disponible." */
export function availableSentence(count: number) {
  return count === 1
    ? "1 persona marcó este turno como disponible."
    : `${count} personas marcaron este turno como disponible.`;
}

/**
 * How many other shifts the candidate already has that day, and, when
 * assigning also accepts them, that it will.
 */
export function candidateDayLine(
  candidate: Pick<VolunteerShiftCandidate, "status" | "shiftsThatDay">,
  autoAccept: boolean = VOLUNTEER_ASSIGN_AUTO_ACCEPTS,
): { text: string; warning: boolean } {
  const count = candidate.shiftsThatDay;
  const warning = count >= VOLUNTEER_MAX_SHIFTS_PER_DAY;
  const sentences = [
    count === 0
      ? "Sin turnos este día"
      : count === 1
        ? "Ya tiene 1 turno este día"
        : `Ya tiene ${count} turnos este día`,
  ];
  if (warning) sentences.push("Podés asignar igual");
  if (candidate.status !== "accepted") {
    sentences.push(
      autoAccept
        ? "Al asignar pasa a Aceptada"
        : VOLUNTEER_ADMIN_COPY.assignmentLocked.replace(/\.$/, ""),
    );
  }
  // A lone sentence reads as a label, without a period (as the mockup).
  const text =
    sentences.length === 1 ? sentences[0]! : `${sentences.join(". ")}.`;
  return { text, warning };
}

/** Runs one row's action, then a toast and a refresh. */
function useRowAction(
  action: () => Promise<VolunteerAdminResult>,
): [boolean, () => void] {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  function run() {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.success) {
          if (result.warning) toast.warning(result.warning);
          else toast.success(result.message);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        toastActionError(error, VOLUNTEER_ADMIN_COPY.genericError);
      }
    });
  }
  return [isPending, run];
}

const rowClass =
  "flex min-w-0 gap-3 rounded-lg border bg-card p-3 text-sm md:rounded-none md:border-0 md:border-t md:bg-transparent md:px-0 md:first:border-t-0";
const rowButtonClass = "h-11 shrink-0 md:h-10";

function NameLink({
  festivalId,
  applicationId,
  name,
}: {
  festivalId: number;
  applicationId: number;
  name: string;
}) {
  return (
    <Link
      href={volunteerApplicationAdminPath(festivalId, applicationId)}
      className={cn("min-w-0 wrap-anywhere", volunteerNameLinkClass)}
    >
      {name}
    </Link>
  );
}

function AssigneeRow({
  festivalId,
  shiftId,
  assignee,
}: {
  festivalId: number;
  shiftId: number;
  assignee: VolunteerShiftDetail["assignees"][number];
}) {
  const [isPending, remove] = useRowAction(() =>
    unassignVolunteerShift({
      festivalId,
      shiftId,
      applicationId: assignee.applicationId,
    }),
  );
  return (
    <li className={cn(rowClass, "items-center")}>
      <div className="flex min-w-0 grow flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <NameLink
            festivalId={festivalId}
            applicationId={assignee.applicationId}
            name={assignee.fullName}
          />
          {assignee.status !== "accepted" && (
            <VolunteerStatusBadge status={assignee.status} />
          )}
        </div>
        <span className="break-words text-muted-foreground">
          {assignee.assignedRoleName ?? "Sin rol"}
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        className={rowButtonClass}
        disabled={isPending}
        aria-label={`Quitar a ${assignee.fullName} de este turno`}
        onClick={remove}
      >
        Quitar
      </Button>
    </li>
  );
}

function CandidateRow({
  festivalId,
  shiftId,
  shiftIsActive,
  candidate,
  autoAccept,
}: {
  festivalId: number;
  shiftId: number;
  shiftIsActive: boolean;
  candidate: VolunteerShiftCandidate;
  autoAccept: boolean;
}) {
  const [isPending, assign] = useRowAction(() =>
    assignVolunteerShift({
      festivalId,
      shiftId,
      applicationId: candidate.applicationId,
    }),
  );
  const day = candidateDayLine(candidate, autoAccept);
  const locked = candidate.status !== "accepted" && !autoAccept;
  return (
    <li className={cn(rowClass, "items-start")}>
      <div className="flex min-w-0 grow flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <NameLink
            festivalId={festivalId}
            applicationId={candidate.applicationId}
            name={candidate.fullName}
          />
          <VolunteerStatusBadge status={candidate.status} />
        </div>
        <span className="break-words">
          1ª {candidate.firstChoiceRoleName} · 2ª{" "}
          {candidate.secondChoiceRoleName}
        </span>
        {day.warning ? (
          <span className="flex items-start gap-1.5 text-amber-900 dark:text-amber-200">
            <TriangleAlertIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
            />
            <span className="min-w-0 break-words">{day.text}</span>
          </span>
        ) : (
          <span className="break-words text-muted-foreground">{day.text}</span>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        className={rowButtonClass}
        disabled={isPending || !shiftIsActive || locked}
        aria-label={`Asignar a ${candidate.fullName}`}
        onClick={assign}
      >
        Asignar
      </Button>
    </li>
  );
}

/** A section: a Card from md, bare on phones where its rows are cards. */
function ShiftSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card
      role="region"
      aria-labelledby={id}
      className="min-w-0 max-md:border-0 max-md:bg-transparent max-md:shadow-none"
    >
      <CardHeader className="gap-1 space-y-0 p-0 pb-2 md:p-6 md:pb-2">
        <h2 id={id} className="text-lg leading-tight font-semibold">
          {title}
        </h2>
        {description && (
          <p className="text-sm break-words text-muted-foreground">
            {description}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 p-0 md:p-6 md:pt-0">
        {children}
      </CardContent>
    </Card>
  );
}

function ShowAll({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="link"
      wrap
      className="min-h-11 self-start px-0 md:min-h-10"
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

/**
 * /dashboard/festivals/[id]/volunteers/shifts/[shiftId], from plain data:
 * the shift's coverage, who is assigned to it ("Quitar") and who marked it
 * and could cover it ("Asignar"), filterable by status. Two columns from lg.
 */
export default function VolunteerShiftDetailView({
  detail,
  autoAccept = VOLUNTEER_ASSIGN_AUTO_ACCEPTS,
}: {
  detail: VolunteerShiftDetail;
  /** VOLUNTEER_ASSIGN_AUTO_ACCEPTS; tests and stories flip it. */
  autoAccept?: boolean;
}) {
  const { festival, shift, assignees, candidates } = detail;
  const state = shiftCoverageState(shift);
  const [filter, setFilter] = useState<CandidateFilter>("all");
  const [allAssignees, setAllAssignees] = useState(false);
  const [allCandidates, setAllCandidates] = useState(false);

  const counts: Record<CandidateFilter, number> = {
    all: candidates.length,
    accepted: 0,
    pending: 0,
    waitlist: 0,
  };
  for (const candidate of candidates) counts[candidate.status] += 1;
  const filtered =
    filter === "all"
      ? candidates
      : candidates.filter((candidate) => candidate.status === filter);

  const shownAssignees = allAssignees
    ? assignees
    : assignees.slice(0, ASSIGNEES_SHOWN);
  const shownCandidates = allCandidates
    ? filtered
    : filtered.slice(0, CANDIDATES_SHOWN);

  return (
    <div className="container flex min-w-0 flex-col gap-4 p-3 pb-10 md:p-6">
      <PageBreadcrumbs
        labels={{
          [`/dashboard/festivals/${festival.id}`]: festival.name,
          [volunteerCoverageHref(festival.id)]: "Cobertura",
        }}
      />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1
            className="min-w-0 text-2xl font-bold break-words md:text-3xl"
            data-installed-title=""
          >
            {formatShiftWhen(shift)}
          </h1>
          {!shift.isActive && <Badge variant="outline">Inactivo</Badge>}
        </div>
        <p className="mt-1 break-words text-muted-foreground">{shift.label}</p>
      </div>

      <Card role="region" aria-label="Cobertura del turno" className="min-w-0">
        <CardContent className="flex flex-col gap-2.5 p-4 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-display text-xl font-semibold tabular-nums">
              {assignedOf(shift)} asignados
            </span>
            <Badge
              variant={COVERAGE_BADGE_VARIANTS[state.kind]}
              className="h-auto whitespace-normal"
            >
              {state.label}
            </Badge>
          </div>
          <CoverageMeter shift={shift} />
          <p className="text-sm text-muted-foreground">
            {availableSentence(shift.availableCount)}
          </p>
        </CardContent>
      </Card>

      <div className="grid min-w-0 items-start gap-4 md:gap-6 lg:grid-cols-2">
        <ShiftSection
          id="volunteer-shift-assignees-title"
          title={`Asignados (${assignees.length})`}
        >
          {assignees.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay nadie asignado a este turno.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 md:gap-0">
              {shownAssignees.map((assignee) => (
                <AssigneeRow
                  key={assignee.applicationId}
                  festivalId={festival.id}
                  shiftId={shift.id}
                  assignee={assignee}
                />
              ))}
            </ul>
          )}
          {shownAssignees.length < assignees.length && (
            <ShowAll
              label={`Ver los ${assignees.length} asignados`}
              onClick={() => setAllAssignees(true)}
            />
          )}
        </ShiftSection>

        <ShiftSection
          id="volunteer-shift-candidates-title"
          title={`Pueden cubrirlo (${candidates.length})`}
          description="Marcaron este turno y todavía no están asignados a él."
        >
          {candidates.length > 0 && (
            <div
              role="group"
              aria-label="Estado de quienes pueden cubrirlo"
              className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden"
            >
              {CANDIDATE_FILTERS.map((option) => {
                const active = option === filter;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(option)}
                    className={cn(
                      "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none md:min-h-7",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-foreground hover:bg-muted",
                    )}
                  >
                    {CANDIDATE_FILTER_LABELS[option]}{" "}
                    <span className="tabular-nums">{counts[option]}</span>
                  </button>
                );
              })}
            </div>
          )}
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {EMPTY_CANDIDATES[filter]}
            </p>
          ) : (
            <ul className="flex flex-col gap-2 md:gap-0">
              {shownCandidates.map((candidate) => (
                <CandidateRow
                  key={candidate.applicationId}
                  festivalId={festival.id}
                  shiftId={shift.id}
                  shiftIsActive={shift.isActive}
                  candidate={candidate}
                  autoAccept={autoAccept}
                />
              ))}
            </ul>
          )}
          {shownCandidates.length < filtered.length && (
            <ShowAll
              label={`Ver los ${filtered.length}`}
              onClick={() => setAllCandidates(true)}
            />
          )}
        </ShiftSection>
      </div>
    </div>
  );
}
