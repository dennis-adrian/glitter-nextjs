"use client";

import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MessageCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/app/components/ui/badge";
import { Button, buttonVariants } from "@/app/components/ui/button";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import {
  availableShiftsTitle,
  ContactList,
  CoverageBadge,
  editAvailabilityLink,
  ExperienceContent,
  markedShifts,
  MotivationText,
  SectionCard,
} from "@/app/components/volunteers/admin/tasks/application-sections";
import ChoiceRow from "@/app/components/volunteers/admin/tasks/choice-row";
import {
  NoteComposer,
  NotesList,
} from "@/app/components/volunteers/admin/tasks/notes-section";
import {
  ageLabel,
  appliedLine,
  formatBirthdate,
} from "@/app/components/volunteers/admin/tasks/review-screen";
import { cn } from "@/app/lib/utils";
import { saveVolunteerPersonAssignment } from "@/app/lib/volunteers/admin-actions";
import {
  defaultAssignedRoleId,
  whatsappHref,
  type VolunteerApplicationDetail,
} from "@/app/lib/volunteers/admin-definitions";
import type {
  VolunteerNote,
  VolunteerTaskCall,
  VolunteerTaskShift,
} from "@/app/lib/volunteers/admin-task-queries";
import {
  formatShortDate,
  plural,
  shiftsByNeed,
  volunteerAvailabilityPath,
} from "@/app/lib/volunteers/admin-tasks";
import {
  compareShiftsByStart,
  formatShiftWhenShort,
} from "@/app/lib/volunteers/format";

export type PersonFlip = {
  label: string;
  previousHref: string | null;
  nextHref: string | null;
};

function PersonTopBar({
  backHref,
  backLabel,
  flip,
}: {
  backHref: string;
  backLabel: string;
  flip: PersonFlip | null;
}) {
  const arrow = buttonVariants({ variant: "ghost", size: "icon" });
  const disabledArrow = cn(arrow, "pointer-events-none opacity-50");
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <Link
        href={backHref}
        className="inline-flex min-h-11 min-w-0 items-center gap-1 font-semibold text-primary"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 break-words">{backLabel}</span>
      </Link>
      {flip && (
        <div className="flex shrink-0 items-center gap-0.5">
          <span className="text-muted-foreground tabular-nums">
            {flip.label}
          </span>
          <Link
            href={flip.previousHref ?? "#"}
            aria-label="Persona anterior"
            aria-disabled={!flip.previousHref}
            tabIndex={flip.previousHref ? undefined : -1}
            className={flip.previousHref ? arrow : disabledArrow}
          >
            <ChevronLeftIcon aria-hidden="true" className="size-4" />
          </Link>
          <Link
            href={flip.nextHref ?? "#"}
            aria-label="Persona siguiente"
            aria-disabled={!flip.nextHref}
            tabIndex={flip.nextHref ? undefined : -1}
            className={flip.nextHref ? arrow : disabledArrow}
          >
            <ChevronRightIcon aria-hidden="true" className="size-4" />
          </Link>
        </div>
      )}
    </div>
  );
}

function roleOptionLabel(
  roleId: number,
  name: string,
  application: Pick<
    VolunteerApplicationDetail,
    "firstChoiceRoleId" | "secondChoiceRoleId"
  >,
) {
  if (roleId === application.firstChoiceRoleId) {
    return `${name} (su 1ª opción)`;
  }
  if (roleId === application.secondChoiceRoleId) {
    return `${name} (su 2ª opción)`;
  }
  return name;
}

/** The roles a select offers: active ones, the current one even if not. */
function roleOptions(
  roles: VolunteerTaskCall["roles"],
  application: VolunteerApplicationDetail,
) {
  const offered = roles.filter(
    (role) => role.isActive || role.id === application.assignedRoleId,
  );
  const rank = (id: number) =>
    id === application.firstChoiceRoleId
      ? 0
      : id === application.secondChoiceRoleId
        ? 1
        : 2;
  return [...offered].sort((a, b) => rank(a.id) - rank(b.id));
}

/**
 * "Darle rol y turnos": a role select and the shifts they marked, each with
 * its coverage; the ones they did not mark behind a toggle. Saves the role
 * and the full set of shifts at once.
 */
function AssignmentForm({
  festivalId,
  application,
  roles,
  shifts,
  onSaved,
  children,
}: {
  festivalId: number;
  application: VolunteerApplicationDetail;
  roles: VolunteerTaskCall["roles"];
  shifts: VolunteerTaskShift[];
  onSaved: () => void;
  /** The sections between the form and its bottom bar. */
  children: React.ReactNode;
}) {
  const options = roleOptions(roles, application);
  const activeRoleIds = new Set(
    roles.filter((role) => role.isActive).map((role) => role.id),
  );
  const [roleId, setRoleId] = useState<number | null>(
    application.assignedRoleId ??
      defaultAssignedRoleId(application, activeRoleIds),
  );
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(application.assignedShiftIds),
  );
  const [showOthers, setShowOthers] = useState(false);
  const [isSaving, startSaving] = useTransition();

  const marked = new Set(application.availableShiftIds);
  // An inactive shift stays listed while it is assigned, ticked or not,
  // so unticking it can be undone.
  const assigned = new Set(application.assignedShiftIds);
  const assignable = shifts.filter(
    (shift) => shift.isActive || assigned.has(shift.id),
  );
  const markedShiftsList = shiftsByNeed(
    assignable
      .filter((shift) => marked.has(shift.id))
      .map((shift) => ({ ...shift, isActive: true })),
  );
  const otherShifts = assignable
    .filter((shift) => !marked.has(shift.id))
    .sort(compareShiftsByStart);
  const othersVisible =
    showOthers || otherShifts.some((shift) => selected.has(shift.id));

  const toggle = (id: number, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const save = () =>
    startSaving(async () => {
      const result = await saveVolunteerPersonAssignment({
        festivalId,
        applicationId: application.id,
        roleId,
        shiftIds: [...selected],
        loadedUpdatedAt: application.updatedAt.toISOString(),
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      if (result.warning) toast.warning(result.warning);
      else toast.success(result.message);
      onSaved();
    });

  const shiftRow = (shift: VolunteerTaskShift) => (
    <ChoiceRow
      key={shift.id}
      id={`assign-shift-${shift.id}`}
      checked={selected.has(shift.id)}
      disabled={isSaving}
      onCheckedChange={(checked) => toggle(shift.id, checked)}
      label={formatShiftWhenShort(shift)}
      aside={<CoverageBadge shift={shift} />}
    >
      <strong className="font-semibold">{formatShiftWhenShort(shift)}</strong>
      <br />
      {shift.label}
    </ChoiceRow>
  );

  return (
    <>
      <SectionCard id="person-assign" title="Darle rol y turnos">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="person-role">Rol</Label>
          <Select
            value={roleId === null ? undefined : String(roleId)}
            onValueChange={(value) => setRoleId(Number(value))}
            disabled={isSaving}
          >
            <SelectTrigger
              id="person-role"
              className="h-auto min-h-10 w-full text-left whitespace-normal break-words [&>span]:line-clamp-none"
            >
              <SelectValue placeholder="Elegí un rol" />
            </SelectTrigger>
            <SelectContent>
              {options.map((role) => (
                <SelectItem key={role.id} value={String(role.id)}>
                  {roleOptionLabel(role.id, role.name, application)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 text-sm leading-5 font-medium text-muted-foreground">
            Turnos que marcó ({markedShiftsList.length})
          </legend>
          {markedShiftsList.map((shift) =>
            shiftRow(shifts.find((s) => s.id === shift.id)!),
          )}
          {othersVisible && otherShifts.map(shiftRow)}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {otherShifts.length > 0 && !othersVisible ? (
              <Button
                type="button"
                variant="link"
                wrap
                className="h-auto px-0"
                disabled={isSaving}
                onClick={() => setShowOthers(true)}
              >
                {otherShifts.length === 1
                  ? "Ver el turno que no marcó"
                  : `Ver los ${otherShifts.length} turnos que no marcó`}
              </Button>
            ) : (
              <span />
            )}
            {editAvailabilityLink(
              volunteerAvailabilityPath(festivalId, application.id),
            )}
          </div>
        </fieldset>
      </SectionCard>

      {children}

      <BottomBar>
        <span className="text-center text-muted-foreground">
          Quedaría con {plural(selected.size, "turno", "turnos")}
        </span>
        <Button
          type="button"
          size="lg"
          wrap
          className="w-full"
          disabled={isSaving}
          onClick={save}
        >
          Guardar asignación
        </Button>
      </BottomBar>
    </>
  );
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-3 mt-auto flex flex-col gap-1.5 border-t bg-card px-3 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgb(0_0_0/0.06)] md:mx-0 md:rounded-lg md:border">
      {children}
    </div>
  );
}

/**
 * An accepted person. With shifts: their assignment and contact first and
 * "Escribir por WhatsApp" at the bottom. Without shifts, or on "Cambiar
 * asignación" (`assigning`): "Darle rol y turnos" first.
 */
export default function VolunteerPersonScreen({
  festivalId,
  application,
  roles,
  shifts,
  notes,
  flip,
  backHref,
  backLabel,
  assigning,
  summaryHref,
  assignHref,
  decisionHref,
  today,
}: {
  festivalId: number;
  application: VolunteerApplicationDetail;
  roles: VolunteerTaskCall["roles"];
  shifts: VolunteerTaskShift[];
  notes: VolunteerNote[];
  flip: PersonFlip | null;
  backHref: string;
  backLabel: string;
  assigning: boolean;
  /** This screen without the assignment form. */
  summaryHref: string;
  /** This screen with it ("Cambiar asignación"). */
  assignHref: string;
  /** Revisar's screen for it ("Cambiar decisión"). */
  decisionHref: string;
  today?: Date;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const age = ageLabel(application.birthdate, today);
  const hasShifts = application.assignedShiftIds.length > 0;
  const assignedRole = roles.find(
    (role) => role.id === application.assignedRoleId,
  );
  const assignedShifts = shifts
    .filter((shift) => application.assignedShiftIds.includes(shift.id))
    .sort(compareShiftsByStart);
  const whatsapp = whatsappHref(application.phone);
  const { marked } = markedShifts(application.availableShiftIds, shifts);
  const choiceRank =
    application.assignedRoleId === application.firstChoiceRoleId
      ? "su 1ª opción"
      : application.assignedRoleId === application.secondChoiceRoleId
        ? "su 2ª opción"
        : null;
  const roleName = (id: number) =>
    roles.find((role) => role.id === id)?.name ?? "Rol eliminado";

  const notesCard = (
    <SectionCard id="person-notes" title="Notas internas">
      <NotesList notes={notes} legacyNote={application.adminNotes} />
      <NoteComposer
        id="person-note"
        festivalId={festivalId}
        applicationId={application.id}
        value={note}
        onChange={setNote}
      />
    </SectionCard>
  );
  const whyCard = (
    <SectionCard id="person-why" title="Por qué quiere ser voluntario/a">
      <MotivationText text={application.motivation} />
    </SectionCard>
  );
  const experienceCard = (
    <SectionCard id="person-experience" title="Experiencia y habilidades">
      <ExperienceContent application={application} />
    </SectionCard>
  );
  const birthdate = formatBirthdate(application.birthdate);
  const changeDecision = (
    <div className="flex">
      <Link
        href={decisionHref}
        className={buttonVariants({
          variant: "link",
          wrap: true,
          className: "px-0",
        })}
      >
        Cambiar decisión
      </Link>
    </div>
  );

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl min-w-0 flex-col gap-3 px-3 pt-2 md:pb-6">
      <PersonTopBar backHref={backHref} backLabel={backLabel} flip={flip} />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="green">Aceptada</Badge>
          {!hasShifts && <Badge variant="amber">Sin turnos</Badge>}
          {hasShifts && application.reviewedAt && (
            <span className="break-words text-muted-foreground">
              Última revisión:{" "}
              {application.reviewedBy
                ? `${application.reviewedBy.displayName}, `
                : ""}
              {formatShortDate(application.reviewedAt)}
            </span>
          )}
        </div>
        <h1
          className="mt-1.5 font-display text-2xl leading-8 font-bold break-words wrap-anywhere"
          data-installed-title=""
        >
          {application.fullName}
        </h1>
        <p className="mt-0.5 break-words text-muted-foreground">
          {assigning
            ? [age, application.zone ? `Zona ${application.zone}` : null]
                .filter(Boolean)
                .join(" · ")
            : [age, appliedLine(application)].filter(Boolean).join(" · ")}
        </p>
      </div>

      {assigning ? (
        <>
          <AssignmentForm
            key={application.updatedAt.getTime()}
            festivalId={festivalId}
            application={application}
            roles={roles}
            shifts={shifts}
            onSaved={() => {
              router.push(summaryHref);
              router.refresh();
            }}
          >
            {whyCard}
            {experienceCard}
            {notesCard}
            <SectionCard id="person-contact" title="Contacto y otros datos">
              <ContactList
                application={application}
                birthdate={birthdate}
                fields={[
                  "phone",
                  "email",
                  "birthdate",
                  "emergency",
                  "referral",
                  "image",
                ]}
              />
            </SectionCard>
            {changeDecision}
          </AssignmentForm>
        </>
      ) : (
        <>
          <SectionCard id="person-assignment" title="Asignación">
            <div className="min-w-0 break-words">
              <span className="text-muted-foreground">Rol</span>
              <br />
              {assignedRole ? (
                <>
                  <strong className="font-semibold">{assignedRole.name}</strong>
                  {choiceRank && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({choiceRank})
                    </span>
                  )}
                </>
              ) : (
                <span>Sin rol</span>
              )}
            </div>
            <div className="min-w-0">
              <span className="text-muted-foreground">Turnos</span>
              <ul className="mt-1 flex flex-col gap-1">
                {assignedShifts.map((shift) => (
                  <li key={shift.id} className="break-words">
                    <strong className="font-semibold">
                      {formatShiftWhenShort(shift)}
                    </strong>{" "}
                    — {shift.label}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex">
              <Link
                href={assignHref}
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  wrap: true,
                })}
              >
                Cambiar asignación
              </Link>
            </div>
          </SectionCard>

          <SectionCard id="person-contact" title="Contacto">
            <ContactList
              application={application}
              birthdate={birthdate}
              fields={["phone", "email", "emergency", "image"]}
            />
          </SectionCard>
          {whyCard}
          {experienceCard}
          <SectionCard id="person-roles" title="Roles que prefiere">
            <p className="break-words">
              <strong className="font-semibold">1ª</strong>{" "}
              {roleName(application.firstChoiceRoleId)}
              <br />
              <strong className="font-semibold">2ª</strong>{" "}
              {roleName(application.secondChoiceRoleId)}
            </p>
          </SectionCard>
          <SectionCard
            id="person-shifts"
            title={availableShiftsTitle(application.availableShiftIds, shifts)}
            action={editAvailabilityLink(
              volunteerAvailabilityPath(festivalId, application.id),
            )}
          >
            {marked.length === 0 ? (
              <p className="text-muted-foreground">No marcó ninguno.</p>
            ) : (
              <ul className="flex flex-col">
                {marked.map((shift) => (
                  <li key={shift.id}>{formatShiftWhenShort(shift)}</li>
                ))}
              </ul>
            )}
          </SectionCard>
          {notesCard}
          {changeDecision}

          {whatsapp && (
            <BottomBar>
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({
                  size: "lg",
                  wrap: true,
                  className: "w-full gap-2",
                })}
              >
                <MessageCircleIcon aria-hidden="true" className="size-4" />
                Escribir por WhatsApp
              </a>
            </BottomBar>
          )}
        </>
      )}
    </div>
  );
}
