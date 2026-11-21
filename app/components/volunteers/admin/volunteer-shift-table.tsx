"use client";

import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useId,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import VolunteerSetupActiveToggle from "@/app/components/volunteers/admin/volunteer-setup-active-toggle";
import {
  fieldErrors,
  SetupCardHeader,
  SetupFieldError,
  SetupWarning,
} from "@/app/components/volunteers/admin/volunteer-setup-parts";
import { toastActionError } from "@/app/lib/errors/action-error";
import { STORE_TIMEZONE } from "@/app/lib/formatters";
import { toStoreDateTimeLocal } from "@/app/lib/schedule-time";
import { cn } from "@/app/lib/utils";
import {
  saveVolunteerShift,
  setVolunteerShiftActive,
} from "@/app/lib/volunteers/admin-actions";
import {
  VOLUNTEER_ADMIN_COPY,
  type VolunteerAdminShift,
  type VolunteerShiftCoverage,
} from "@/app/lib/volunteers/admin-definitions";
import {
  volunteerShiftInputSchema,
  type VolunteerShiftInput,
} from "@/app/lib/volunteers/admin-schema";
import { formatShiftDay, formatShiftHours } from "@/app/lib/volunteers/format";

/** What the shift editor holds: the raw input values, on La Paz's clock. */
export type VolunteerShiftDraft = {
  date: string;
  startTime: string;
  endTime: string;
  label: string;
  neededHeadcount: string;
};
type DraftField = keyof VolunteerShiftDraft;
type DraftErrors = Partial<Record<DraftField, string>>;

/** The editor's starting values: a shift's day and times in La Paz. */
export function volunteerShiftDraft(
  shift?: VolunteerAdminShift,
): VolunteerShiftDraft {
  if (!shift) {
    return {
      date: "",
      startTime: "",
      endTime: "",
      label: "",
      neededHeadcount: "0",
    };
  }
  const [date = "", startTime = ""] = toStoreDateTimeLocal(
    shift.startsAt,
  ).split("T");
  return {
    date,
    startTime,
    endTime: toStoreDateTimeLocal(shift.endsAt).split("T")[1] ?? "",
    label: shift.label,
    neededHeadcount: String(shift.neededHeadcount),
  };
}

/** Shifts as the festival runs them: by start, then id. */
export function chronologicalShifts<Shift extends VolunteerAdminShift>(
  shifts: readonly Shift[],
): Shift[] {
  return [...shifts].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id - b.id,
  );
}

/** "viernes 18", for the "Activo" checkbox's name. */
function spokenDay(date: Date) {
  return DateTime.fromJSDate(date, { zone: STORE_TIMEZONE })
    .setLocale("es")
    .toFormat("cccc d");
}

function activeLabel(shift: VolunteerAdminShift) {
  return `${shift.label}, ${spokenDay(shift.startsAt)}, activo`;
}

/** "11 personas ya eligieron este turno con el horario 10:00–14:00. …" */
export function shiftChosenWarning(shift: VolunteerShiftCoverage) {
  const who =
    shift.availableCount === 1
      ? "1 persona ya eligió"
      : `${shift.availableCount} personas ya eligieron`;
  return `${who} este turno con el horario ${formatShiftHours(shift)}. Si cambiás el día o la hora, avisales por WhatsApp.`;
}

type Editing = number | "new" | null;

/**
 * "Turnos": every shift of the call in time order, with its cupo, how many
 * marked it and whether the form offers it. A table from md, cards below;
 * either edits one shift (or a new one) in place.
 */
export default function VolunteerShiftTable({
  festivalId,
  shifts: allShifts,
  initialEditing = null,
}: {
  festivalId: number;
  shifts: VolunteerShiftCoverage[];
  /** A shift id or "new" to open the editor at first; stories use it. */
  initialEditing?: Editing;
}) {
  const router = useRouter();
  const baseId = useId();
  const shifts = chronologicalShifts(allShifts);
  const [editing, setEditing] = useState<Editing>(initialEditing);
  const [draft, setDraft] = useState<VolunteerShiftDraft>(() =>
    volunteerShiftDraft(
      shifts.find((shift) => shift.id === initialEditing) ?? undefined,
    ),
  );
  const [errors, setErrors] = useState<DraftErrors>({});
  const [isSaving, startSaving] = useTransition();

  function open(target: Exclude<Editing, null>) {
    setEditing(target);
    setErrors({});
    setDraft(
      volunteerShiftDraft(
        target === "new"
          ? undefined
          : shifts.find((shift) => shift.id === target),
      ),
    );
  }

  function close() {
    setEditing(null);
    setErrors({});
  }

  function change(field: DraftField, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editing === null || isSaving) return;
    const input: VolunteerShiftInput = {
      festivalId,
      shiftId: editing === "new" ? undefined : editing,
      ...draft,
    };
    const parsed = volunteerShiftInputSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrors<DraftField>(parsed.error.issues));
      return;
    }
    setErrors({});
    startSaving(async () => {
      try {
        // The raw strings: the action reads them on La Paz's clock itself.
        const result = await saveVolunteerShift(input);
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        if (result.warning) toast.warning(result.warning);
        else toast.success(result.message);
        close();
        router.refresh();
      } catch (error) {
        toastActionError(error, VOLUNTEER_ADMIN_COPY.genericError);
      }
    });
  }

  const toggle = (shift: VolunteerAdminShift) => (isActive: boolean) =>
    setVolunteerShiftActive({ festivalId, id: shift.id, isActive });

  /** One input of the editor in a layout: its props and its error line. */
  function field(layout: "row" | "card", name: DraftField) {
    const errorId = `${baseId}-${layout}-${name}-error`;
    return {
      props: {
        id: `${baseId}-${layout}-${name}`,
        value: draft[name],
        onChange: (event: { target: { value: string } }) =>
          change(name, event.target.value),
        "aria-invalid": errors[name] ? true : undefined,
        "aria-describedby": errors[name] ? errorId : undefined,
      },
      error: <SetupFieldError id={errorId} message={errors[name]} />,
    };
  }

  const editedShift =
    typeof editing === "number"
      ? shifts.find((shift) => shift.id === editing)
      : undefined;
  const warning =
    editedShift && editedShift.availableCount > 0
      ? shiftChosenWarning(editedShift)
      : null;

  function rowEditor(shift: VolunteerShiftCoverage | undefined) {
    const formId = `${baseId}-row-form`;
    const parts = (name: DraftField) => {
      const { props, error } = field("row", name);
      return { props: { ...props, form: formId }, error };
    };
    const date = parts("date");
    const start = parts("startTime");
    const end = parts("endTime");
    const label = parts("label");
    const cupo = parts("neededHeadcount");
    return (
      <>
        <TableRow data-state="selected" className="align-top">
          <TableCell className="px-3 py-3 align-top">
            <Input
              type="date"
              aria-label="Día"
              className="h-9 min-w-36"
              autoFocus
              {...date.props}
            />
            {date.error}
          </TableCell>
          <TableCell className="px-3 py-3 align-top">
            <div className="flex items-start gap-1.5">
              <Input
                type="time"
                aria-label="Hora de inicio"
                className="h-9 min-w-26"
                {...start.props}
              />
              <span aria-hidden="true" className="flex h-9 items-center">
                –
              </span>
              <Input
                type="time"
                aria-label="Hora de fin"
                className="h-9 min-w-26"
                {...end.props}
              />
            </div>
            {start.error}
            {end.error}
          </TableCell>
          <TableCell className="px-3 py-3 align-top">
            <Input
              type="text"
              aria-label="Nombre del turno"
              maxLength={120}
              className="h-9 min-w-40"
              {...label.props}
            />
            {label.error}
          </TableCell>
          <TableCell className="px-3 py-3 align-top text-right">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              aria-label="Cupo"
              className="ml-auto h-9 w-20 text-right"
              {...cupo.props}
            />
            {cupo.error}
          </TableCell>
          <TableCell className="px-3 py-3 align-top text-right tabular-nums">
            <div className="flex h-9 items-center justify-end">
              {shift ? shift.availableCount : "—"}
            </div>
          </TableCell>
          <TableCell className="px-3 py-3 align-top">
            {shift && (
              <div className="flex h-9 items-center">
                <VolunteerSetupActiveToggle
                  checked={shift.isActive}
                  label={activeLabel(shift)}
                  onToggle={toggle(shift)}
                />
              </div>
            )}
          </TableCell>
          <TableCell className="px-3 py-3 align-top">
            <form
              id={formId}
              onSubmit={save}
              noValidate
              className="flex justify-end gap-1"
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={close}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isSaving}>
                {isSaving ? "Guardando..." : "Guardar"}
              </Button>
            </form>
          </TableCell>
        </TableRow>
        {shift && warning && (
          <TableRow data-state="selected">
            <TableCell colSpan={7} className="px-3 pt-0 pb-3">
              <SetupWarning>{warning}</SetupWarning>
            </TableCell>
          </TableRow>
        )}
      </>
    );
  }

  function cardEditor(shift: VolunteerShiftCoverage | undefined) {
    const date = field("card", "date");
    const start = field("card", "startTime");
    const end = field("card", "endTime");
    const label = field("card", "label");
    const cupo = field("card", "neededHeadcount");
    return (
      <form
        onSubmit={save}
        noValidate
        className="grid min-w-0 gap-3"
        aria-label={shift ? `Editar ${shift.label}` : "Nuevo turno"}
      >
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={date.props.id}>Día</Label>
          <Input type="date" className="min-w-0" autoFocus {...date.props} />
          {date.error}
        </div>
        <div className="grid min-w-0 grid-cols-2 items-start gap-3">
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={start.props.id}>Inicio</Label>
            <Input type="time" className="min-w-0" {...start.props} />
            {start.error}
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={end.props.id}>Fin</Label>
            <Input type="time" className="min-w-0" {...end.props} />
            {end.error}
          </div>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={label.props.id}>Nombre del turno</Label>
          <Input
            type="text"
            maxLength={120}
            className="min-w-0"
            {...label.props}
          />
          {label.error}
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={cupo.props.id}>Cupo</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className="w-28"
            {...cupo.props}
          />
          {cupo.error}
        </div>
        {shift && warning && <SetupWarning>{warning}</SetupWarning>}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 flex-1"
            onClick={close}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button type="submit" className="min-h-11 flex-1" disabled={isSaving}>
            {isSaving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </form>
    );
  }

  const empty = shifts.length === 0 && editing !== "new";

  return (
    <Card role="region" aria-labelledby="volunteer-shifts-title">
      <SetupCardHeader
        titleId="volunteer-shifts-title"
        title="Turnos"
        description="El cupo es cuántas personas necesitás en ese turno. Un turno desactivado no aparece en el formulario."
        addLabel="Agregar turno"
        onAdd={() => open("new")}
        addDisabled={editing === "new"}
      />
      <CardContent className="min-w-0 p-4 pt-0 md:px-0 md:pb-2">
        <Table
          className="min-w-[860px]"
          wrapperClassName="hidden overflow-x-auto md:block"
        >
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="md:pl-6">Día</TableHead>
              <TableHead>Horario</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead className="text-right">Cupo</TableHead>
              <TableHead className="text-right">Lo eligieron</TableHead>
              <TableHead>Activo</TableHead>
              <TableHead className="md:pr-6">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {editing === "new" && rowEditor(undefined)}
            {empty && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground md:px-6"
                >
                  Todavía no hay turnos. Quien se postula marca en cuáles puede
                  estar.
                </TableCell>
              </TableRow>
            )}
            {shifts.map((shift) =>
              editing === shift.id ? (
                <Fragment key={shift.id}>{rowEditor(shift)}</Fragment>
              ) : (
                <TableRow
                  key={shift.id}
                  className={cn(!shift.isActive && "text-muted-foreground")}
                >
                  <TableCell className="font-semibold whitespace-nowrap md:pl-6">
                    {formatShiftDay(shift.startsAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatShiftHours(shift)}
                  </TableCell>
                  <TableCell className="break-words">{shift.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {shift.neededHeadcount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {shift.availableCount}
                  </TableCell>
                  <TableCell>
                    <VolunteerSetupActiveToggle
                      checked={shift.isActive}
                      label={activeLabel(shift)}
                      onToggle={toggle(shift)}
                    />
                  </TableCell>
                  <TableCell className="text-right md:pr-6">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Editar ${shift.label}, ${spokenDay(shift.startsAt)}`}
                      onClick={() => open(shift.id)}
                    >
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>

        <ul className="grid min-w-0 gap-3 md:hidden">
          {editing === "new" && (
            <li className="min-w-0 rounded-lg border border-primary bg-primary/5 p-3">
              {cardEditor(undefined)}
            </li>
          )}
          {empty && (
            <li className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Todavía no hay turnos. Quien se postula marca en cuáles puede
              estar.
            </li>
          )}
          {shifts.map((shift) => (
            <li
              key={shift.id}
              className={cn(
                "min-w-0 space-y-2 rounded-lg border p-3",
                editing === shift.id && "border-primary bg-primary/5",
              )}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div
                  className={cn(
                    "min-w-0",
                    !shift.isActive && "text-muted-foreground",
                  )}
                >
                  <p className="font-semibold break-words tabular-nums">
                    {formatShiftDay(shift.startsAt)} · {formatShiftHours(shift)}
                  </p>
                  <p className="text-sm break-words text-muted-foreground">
                    {shift.label}
                  </p>
                </div>
                <VolunteerSetupActiveToggle
                  checked={shift.isActive}
                  label={activeLabel(shift)}
                  onToggle={toggle(shift)}
                  showLabel
                />
              </div>
              <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-muted-foreground">Cupo</dt>
                  <dd className="font-medium tabular-nums">
                    {shift.neededHeadcount}
                  </dd>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-muted-foreground">Lo eligieron</dt>
                  <dd className="font-medium tabular-nums">
                    {shift.availableCount}
                  </dd>
                </div>
              </dl>
              {editing === shift.id ? (
                <div className="border-t pt-3">{cardEditor(shift)}</div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full"
                  aria-label={`Editar ${shift.label}, ${spokenDay(shift.startsAt)}`}
                  onClick={() => open(shift.id)}
                >
                  Editar
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
