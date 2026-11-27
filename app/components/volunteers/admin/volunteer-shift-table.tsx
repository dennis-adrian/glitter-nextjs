"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { DateTime } from "luxon";
import { TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useId, useState, type ReactElement } from "react";
import {
  useForm,
  type ControllerRenderProps,
  type Resolver,
} from "react-hook-form";
import { toast } from "sonner";

import TextInput from "@/app/components/form/fields/text";
import SubmitButton from "@/app/components/simple-submit-button";
import { Banner } from "@/app/components/ui/banner";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import VolunteerSetupActiveToggle from "@/app/components/volunteers/admin/volunteer-setup-active-toggle";
import { SetupCardHeader } from "@/app/components/volunteers/admin/volunteer-setup-parts";
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
import { volunteerShiftInputSchema } from "@/app/lib/volunteers/admin-schema";
import {
  compareShiftsByStart,
  formatShiftDay,
  formatShiftHours,
} from "@/app/lib/volunteers/format";

/** What the shift editor holds: the raw input values, on La Paz's clock. */
export type VolunteerShiftDraft = {
  date: string;
  startTime: string;
  endTime: string;
  label: string;
  neededHeadcount: string;
};
type DraftField = keyof VolunteerShiftDraft;
/** The editor's form: the draft plus which festival and shift it saves. */
type ShiftFormValues = VolunteerShiftDraft & {
  festivalId: number;
  shiftId?: number;
};

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
  return [...shifts].sort(compareShiftsByStart);
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

/** The row editor's error line: tighter than the form default. */
const rowErrorClass = "mt-1 text-xs font-medium";

/** The amber notice: something to know before saving, not an error. */
function ShiftWarning({ children }: { children: string }) {
  return (
    <div role="status" className="min-w-0">
      <Banner variant="warning" icon={TriangleAlertIcon}>
        <span className="break-words">{children}</span>
      </Banner>
    </div>
  );
}

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

  function formValues(target: Editing): ShiftFormValues {
    const shift =
      typeof target === "number"
        ? shifts.find((candidate) => candidate.id === target)
        : undefined;
    return {
      festivalId,
      shiftId: shift?.id,
      ...volunteerShiftDraft(shift),
    };
  }

  const form = useForm<ShiftFormValues>({
    // The schema reads the raw strings into instants; the form keeps the
    // strings, which is what the action takes.
    resolver: zodResolver(
      volunteerShiftInputSchema,
    ) as unknown as Resolver<ShiftFormValues>,
    defaultValues: formValues(initialEditing),
    // Both layouts' inputs are mounted; the hidden one cannot take focus.
    shouldFocusError: false,
  });
  const isSaving = form.formState.isSubmitting;

  function open(target: Exclude<Editing, null>) {
    // The form is shared: switching mid-save would let that save close the next editor.
    if (isSaving) return;
    setEditing(target);
    form.reset(formValues(target));
  }

  function close() {
    setEditing(null);
    form.reset(formValues(null));
  }

  const save = form.handleSubmit(async () => {
    if (editing === null) return;
    try {
      // The raw strings: the action reads them on La Paz's clock itself.
      const result = await saveVolunteerShift(form.getValues());
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

  const toggle = (shift: VolunteerAdminShift) => (isActive: boolean) =>
    setVolunteerShiftActive({ festivalId, id: shift.id, isActive });

  /** One input of the row editor, tied to its form, with its error line. */
  function rowField(
    name: DraftField,
    input: (
      field: ControllerRenderProps<ShiftFormValues, DraftField>,
    ) => ReactElement,
    className?: string,
  ) {
    return (
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => (
          <FormItem className={className ?? "min-w-0"}>
            <FormControl>{input(field)}</FormControl>
            <FormMessage className={rowErrorClass} />
          </FormItem>
        )}
      />
    );
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
    return (
      <>
        <TableRow data-state="selected" className="align-top">
          <TableCell className="px-3 py-3 align-top">
            {rowField("date", (field) => (
              <Input
                type="date"
                aria-label="Día"
                className="h-9 min-w-36"
                autoFocus
                form={formId}
                {...field}
              />
            ))}
          </TableCell>
          <TableCell className="px-3 py-3 align-top">
            <div className="flex items-start gap-1.5">
              {rowField("startTime", (field) => (
                <Input
                  type="time"
                  aria-label="Hora de inicio"
                  className="h-9 min-w-26"
                  form={formId}
                  {...field}
                />
              ))}
              <span aria-hidden="true" className="flex h-9 items-center">
                –
              </span>
              {rowField("endTime", (field) => (
                <Input
                  type="time"
                  aria-label="Hora de fin"
                  className="h-9 min-w-26"
                  form={formId}
                  {...field}
                />
              ))}
            </div>
          </TableCell>
          <TableCell className="px-3 py-3 align-top">
            {rowField("label", (field) => (
              <Input
                type="text"
                aria-label="Nombre del turno"
                maxLength={120}
                className="h-9 min-w-40"
                form={formId}
                {...field}
              />
            ))}
          </TableCell>
          <TableCell className="px-3 py-3 align-top text-right">
            {rowField("neededHeadcount", (field) => (
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                aria-label="Cupo"
                className="ml-auto h-9 w-20 text-right"
                form={formId}
                {...field}
              />
            ))}
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
              <SubmitButton
                size="sm"
                className="w-auto"
                disabled={false}
                label="Guardar"
                submittingLabel="Guardando..."
              />
            </form>
          </TableCell>
        </TableRow>
        {shift && warning && (
          <TableRow data-state="selected">
            <TableCell colSpan={7} className="px-3 pt-0 pb-3">
              <ShiftWarning>{warning}</ShiftWarning>
            </TableCell>
          </TableRow>
        )}
      </>
    );
  }

  function cardEditor(shift: VolunteerShiftCoverage | undefined) {
    return (
      <form
        onSubmit={save}
        noValidate
        className="grid min-w-0 gap-3"
        aria-label={shift ? `Editar ${shift.label}` : "Nuevo turno"}
      >
        <TextInput
          name="date"
          label="Día"
          type="date"
          className="min-w-0"
          autoFocus
        />
        <div className="grid min-w-0 grid-cols-2 items-start gap-3">
          <TextInput
            name="startTime"
            label="Inicio"
            type="time"
            className="min-w-0"
          />
          <TextInput
            name="endTime"
            label="Fin"
            type="time"
            className="min-w-0"
          />
        </div>
        <TextInput
          name="label"
          label="Nombre del turno"
          type="text"
          maxLength={120}
          className="min-w-0"
        />
        <TextInput
          name="neededHeadcount"
          label="Cupo"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          className="w-28"
        />
        {shift && warning && <ShiftWarning>{warning}</ShiftWarning>}
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
          <SubmitButton
            className="min-h-11 flex-1"
            disabled={false}
            label="Guardar"
            submittingLabel="Guardando..."
          />
        </div>
      </form>
    );
  }

  const empty = shifts.length === 0 && editing !== "new";

  return (
    <Card role="region" aria-labelledby="volunteer-shifts-title">
      <Form {...form}>
        <SetupCardHeader
          titleId="volunteer-shifts-title"
          title="Turnos"
          description="El cupo es cuántas personas necesitás en ese turno. Un turno desactivado no aparece en el formulario."
          addLabel="Agregar turno"
          onAdd={() => open("new")}
          addDisabled={editing === "new" || isSaving}
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
                    Todavía no hay turnos. Quien se postula marca en cuáles
                    puede estar.
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
                        disabled={isSaving}
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
                      {formatShiftDay(shift.startsAt)} ·{" "}
                      {formatShiftHours(shift)}
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
                    disabled={isSaving}
                  >
                    Editar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Form>
    </Card>
  );
}
