"use client";

import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/app/components/ui/button";
import {
  AgeAndConsentTiles,
  AvailableShiftsContent,
  availableShiftsTitle,
  ContactList,
  editAvailabilityLink,
  ExperienceContent,
  MotivationText,
  RoleChoices,
  SectionCard,
  SectionHeading,
} from "@/app/components/volunteers/admin/tasks/application-sections";
import {
  NoteComposer,
  NotesList,
} from "@/app/components/volunteers/admin/tasks/notes-section";
import VolunteerStatusBadge from "@/app/components/volunteers/admin/volunteer-status-badge";
import { cn } from "@/app/lib/utils";
import { decideVolunteerApplication } from "@/app/lib/volunteers/admin-actions";
import {
  ageOn,
  type VolunteerApplicationDetail,
} from "@/app/lib/volunteers/admin-definitions";
import type {
  VolunteerNote,
  VolunteerTaskCall,
} from "@/app/lib/volunteers/admin-task-queries";
import {
  formatShortDate,
  nextAfterDecision,
  reviewPosition,
  volunteerAvailabilityPath,
  volunteerReviewHref,
  type VolunteerReviewSort,
} from "@/app/lib/volunteers/admin-tasks";
import type { VolunteerApplicationStatus } from "@/app/lib/volunteers/definitions";
import { formatYears } from "@/app/lib/volunteers/format";

const DECISIONS = [
  { status: "rejected", label: "No aceptar" },
  { status: "waitlist", label: "En espera" },
  { status: "accepted", label: "Aceptar" },
] as const satisfies ReadonlyArray<{
  status: VolunteerApplicationStatus;
  label: string;
}>;

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    target.getAttribute("role") === "combobox"
  );
}

/** "Zona Sopocachi · postuló el 21 nov" */
export function appliedLine(
  application: Pick<VolunteerApplicationDetail, "zone" | "createdAt">,
) {
  return [
    application.zone ? `Zona ${application.zone}` : null,
    `postuló el ${formatShortDate(application.createdAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function formatBirthdate(birthdate: string) {
  const date = DateTime.fromISO(birthdate);
  return date.isValid ? date.toFormat("dd/LL/yyyy") : birthdate;
}

export function ageLabel(birthdate: string, today?: Date) {
  const age = ageOn(birthdate, today);
  return Number.isFinite(age) && age >= 0 ? formatYears(age) : null;
}

function FlipControls({
  label,
  previousHref,
  nextHref,
}: {
  label: string;
  previousHref: string | null;
  nextHref: string | null;
}) {
  const arrow = buttonVariants({ variant: "ghost", size: "icon" });
  return (
    <>
      <span className="font-semibold tabular-nums lg:font-normal lg:text-muted-foreground">
        {label}
      </span>
      <div className="flex gap-0.5">
        {previousHref ? (
          <Link
            href={previousHref}
            aria-label="Postulación anterior"
            className={arrow}
          >
            <ChevronLeftIcon aria-hidden="true" className="size-4" />
          </Link>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            disabled
            aria-label="Postulación anterior"
          >
            <ChevronLeftIcon aria-hidden="true" className="size-4" />
          </Button>
        )}
        {nextHref ? (
          <Link
            href={nextHref}
            aria-label="Postulación siguiente"
            className={arrow}
          >
            <ChevronRightIcon aria-hidden="true" className="size-4" />
          </Link>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            disabled
            aria-label="Postulación siguiente"
          >
            <ChevronRightIcon aria-hidden="true" className="size-4" />
          </Button>
        )}
      </div>
    </>
  );
}

/**
 * Revisar's one application, in the order that decides it: name, age and
 * image consent; why; experience; roles; shifts; notes; contact last. A top
 * bar flips through the pending ones (arrow keys too); the bottom bar
 * decides, moves on to the next pending one and offers "Deshacer".
 *
 * `order` is the pending ids in the list's sort. An application that is not
 * pending (reached from elsewhere) shows the same screen without flipping,
 * and stays put after a decision.
 */
export default function VolunteerReviewScreen({
  festivalId,
  application,
  roles,
  shifts,
  notes,
  order,
  sort,
  today,
}: {
  festivalId: number;
  application: VolunteerApplicationDetail;
  roles: VolunteerTaskCall["roles"];
  shifts: VolunteerTaskCall["shifts"];
  notes: VolunteerNote[];
  order: number[];
  sort: VolunteerReviewSort;
  today?: Date;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [isDeciding, startDeciding] = useTransition();
  const isPending = application.status === "pending";
  const position = reviewPosition(order, application.id);
  const flipping = isPending && position.position > 0;
  const hrefFor = (id: number | null) =>
    id === null ? null : volunteerReviewHref(festivalId, sort, id);
  const previousHref = flipping ? hrefFor(position.previousId) : null;
  const nextHref = flipping ? hrefFor(position.nextId) : null;
  const listHref = volunteerReviewHref(festivalId, sort);
  const counter = `${position.position} de ${position.total} pendientes`;

  useEffect(() => {
    if (!flipping) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      if (isTyping(event.target)) return;
      if (event.key === "ArrowLeft" && previousHref) {
        event.preventDefault();
        router.push(previousHref);
      } else if (event.key === "ArrowRight" && nextHref) {
        event.preventDefault();
        router.push(nextHref);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipping, previousHref, nextHref, router]);

  const decide = (status: VolunteerApplicationStatus) =>
    startDeciding(async () => {
      const result = await decideVolunteerApplication({
        festivalId,
        applicationId: application.id,
        status,
        note,
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      setNote("");
      const { previousStatus, decidedAt } = result;
      const decidedHref = volunteerReviewHref(festivalId, sort, application.id);
      toast(result.message, {
        action: {
          label: "Deshacer",
          onClick: async () => {
            const undo = await decideVolunteerApplication({
              festivalId,
              applicationId: application.id,
              status: previousStatus,
              expectedUpdatedAt: decidedAt,
            });
            if (!undo.success) {
              toast.error(undo.message);
              return;
            }
            router.push(decidedHref);
            router.refresh();
          },
        },
      });
      if (isPending) {
        const next = nextAfterDecision(order, application.id);
        router.push(next === null ? listHref : (hrefFor(next) ?? listHref));
      } else {
        router.refresh();
      }
    });

  const age = ageLabel(application.birthdate, today);
  const sectionCard =
    "lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none";

  return (
    <div className="flex min-w-0 flex-col lg:rounded-lg lg:border lg:bg-card">
      <header className="flex min-w-0 items-center justify-between gap-2 border-b bg-card px-2 pt-1 pb-2 lg:hidden">
        <Link
          href={listHref}
          aria-label="Salir de la revisión"
          className={buttonVariants({ variant: "ghost", size: "icon" })}
        >
          <XIcon aria-hidden="true" className="size-4" />
        </Link>
        {flipping ? (
          <FlipControls
            label={counter}
            previousHref={previousHref}
            nextHref={nextHref}
          />
        ) : (
          <VolunteerStatusBadge status={application.status} />
        )}
      </header>

      <div className="flex min-w-0 flex-col gap-3 px-3 pt-4 pb-6 lg:gap-5 lg:p-6">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {!isPending && (
              <VolunteerStatusBadge
                status={application.status}
                className="mb-1.5 max-lg:hidden"
              />
            )}
            <h1
              className="font-display text-2xl leading-8 font-bold break-words wrap-anywhere"
              data-installed-title=""
            >
              {application.fullName}
            </h1>
            <p className="mt-0.5 break-words text-muted-foreground">
              {appliedLine(application)}
            </p>
            <AgeAndConsentTiles
              age={age}
              imageConsent={application.imageConsent}
            />
          </div>
          {flipping && (
            <div className="hidden items-center gap-1 lg:flex">
              <FlipControls
                label={counter}
                previousHref={previousHref}
                nextHref={nextHref}
              />
            </div>
          )}
        </div>

        <SectionCard
          id="review-why"
          title="Por qué quiere ser voluntario/a"
          className={sectionCard}
        >
          <MotivationText text={application.motivation} />
        </SectionCard>

        <div className="flex min-w-0 flex-col gap-3 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))] lg:items-start lg:gap-5">
          <SectionCard
            id="review-experience"
            title="Experiencia y habilidades"
            className={sectionCard}
          >
            <ExperienceContent application={application} />
          </SectionCard>
          <SectionCard
            id="review-roles"
            title="Roles que prefiere"
            className={sectionCard}
          >
            <RoleChoices application={application} roles={roles} />
          </SectionCard>
        </div>

        <SectionCard
          id="review-shifts"
          title={availableShiftsTitle(application.availableShiftIds, shifts)}
          action={editAvailabilityLink(
            volunteerAvailabilityPath(festivalId, application.id),
          )}
          className={sectionCard}
        >
          <div className="lg:hidden">
            <AvailableShiftsContent
              ids={application.availableShiftIds}
              shifts={shifts}
            />
          </div>
          <div className="hidden lg:contents">
            <AvailableShiftsContent
              ids={application.availableShiftIds}
              shifts={shifts}
              layout="grid"
            />
          </div>
        </SectionCard>

        <SectionCard
          id="review-notes"
          title="Notas internas"
          className={sectionCard}
        >
          <NotesList notes={notes} legacyNote={application.adminNotes} />
          <NoteComposer
            id="review-note"
            festivalId={festivalId}
            applicationId={application.id}
            value={note}
            onChange={setNote}
          />
        </SectionCard>

        <section
          aria-labelledby="review-contact"
          className="flex min-w-0 flex-col gap-2.5 rounded-lg border bg-card p-4 shadow-xs lg:rounded-none lg:border-0 lg:border-t lg:bg-transparent lg:px-0 lg:pt-4 lg:pb-0 lg:shadow-none"
        >
          <SectionHeading id="review-contact">
            Contacto y otros datos
          </SectionHeading>
          <ContactList
            application={application}
            birthdate={formatBirthdate(application.birthdate)}
          />
        </section>

        <p className="text-muted-foreground">
          La persona no recibe ningún aviso automático cuando decidís.
        </p>
      </div>

      <div className="sticky bottom-0 z-10 flex gap-2 border-t bg-card px-3 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgb(0_0_0/0.06)] lg:static lg:justify-end lg:px-6 lg:py-4 lg:shadow-none">
        {DECISIONS.map((decision) => {
          const primary = decision.status === "accepted";
          const current = decision.status === application.status;
          return (
            <Button
              key={decision.status}
              type="button"
              variant={primary ? "default" : "outline"}
              wrap
              disabled={isDeciding || current}
              onClick={() => decide(decision.status)}
              className={cn(
                "min-h-12 min-w-0 basis-0 px-2 lg:min-h-10 lg:flex-none lg:basis-auto lg:px-4",
                primary ? "flex-[1.3] lg:min-w-35" : "flex-1",
              )}
            >
              {decision.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
