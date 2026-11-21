"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useId, useState, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";

import TextInput from "@/app/components/form/fields/text";
import SubmitButton from "@/app/components/simple-submit-button";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
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
import { Textarea } from "@/app/components/ui/textarea";
import VolunteerSetupActiveToggle from "@/app/components/volunteers/admin/volunteer-setup-active-toggle";
import { SetupCardHeader } from "@/app/components/volunteers/admin/volunteer-setup-parts";
import { toastActionError } from "@/app/lib/errors/action-error";
import { cn } from "@/app/lib/utils";
import {
  moveVolunteerRole,
  saveVolunteerRole,
  setVolunteerRoleActive,
} from "@/app/lib/volunteers/admin-actions";
import {
  VOLUNTEER_ADMIN_COPY,
  type VolunteerAdminResult,
  type VolunteerAdminRole,
} from "@/app/lib/volunteers/admin-definitions";
import { volunteerRoleInputSchema } from "@/app/lib/volunteers/admin-schema";

/** The editor's form; no sortOrder: a new role goes last, an edited one keeps its place. */
type RoleFormValues = {
  festivalId: number;
  roleId?: number;
  name: string;
  description: string;
};
type Editing = number | "new" | null;
type Direction = "up" | "down";

/** The row editor's error line: tighter than the form default. */
const rowErrorClass = "mt-1 text-xs font-medium";

/** Roles in the order the public page lists them. */
export function orderedRoles(roles: readonly VolunteerAdminRole[]) {
  return [...roles].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

/**
 * "Roles": the call's roles in the order the page shows them, reordered with
 * up/down buttons, with how many applications chose each. A table from md,
 * cards below; either edits one role (or a new one) in place.
 */
export default function VolunteerRoleTable({
  festivalId,
  roles: allRoles,
  initialEditing = null,
}: {
  festivalId: number;
  roles: VolunteerAdminRole[];
  /** A role id or "new" to open the editor at first; stories use it. */
  initialEditing?: Editing;
}) {
  const router = useRouter();
  const baseId = useId();
  const roles = orderedRoles(allRoles);
  const [editing, setEditing] = useState<Editing>(initialEditing);
  const [isMoving, startMoving] = useTransition();

  function formValues(target: Editing): RoleFormValues {
    const role =
      typeof target === "number"
        ? roles.find((candidate) => candidate.id === target)
        : undefined;
    return {
      festivalId,
      roleId: role?.id,
      name: role?.name ?? "",
      description: role?.description ?? "",
    };
  }

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(
      volunteerRoleInputSchema,
    ) as unknown as Resolver<RoleFormValues>,
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

  /** Answers a role action: toast, and a refresh when it went through. */
  async function settle(run: () => Promise<VolunteerAdminResult>) {
    try {
      const result = await run();
      if (!result.success) {
        toast.error(result.message);
        return false;
      }
      toast.success(result.message);
      router.refresh();
      return true;
    } catch (error) {
      toastActionError(error, VOLUNTEER_ADMIN_COPY.genericError);
      return false;
    }
  }

  const save = form.handleSubmit(async () => {
    if (editing === null) return;
    if (await settle(() => saveVolunteerRole(form.getValues()))) close();
  });

  function move(role: VolunteerAdminRole, direction: Direction) {
    startMoving(async () => {
      await settle(() =>
        moveVolunteerRole({ festivalId, roleId: role.id, direction }),
      );
    });
  }

  const toggle = (role: VolunteerAdminRole) => (isActive: boolean) =>
    setVolunteerRoleActive({ festivalId, id: role.id, isActive });

  function moveButtons(role: VolunteerAdminRole, index: number, big = false) {
    const buttons: Array<[Direction, string, typeof ChevronUpIcon, boolean]> = [
      ["up", `Subir ${role.name}`, ChevronUpIcon, index === 0],
      [
        "down",
        `Bajar ${role.name}`,
        ChevronDownIcon,
        index === roles.length - 1,
      ],
    ];
    return (
      <div className="flex gap-0.5">
        {buttons.map(([direction, label, Icon, edge]) => (
          <Button
            key={direction}
            type="button"
            variant="ghost"
            size="icon"
            className={big ? "size-11" : "size-8"}
            aria-label={label}
            disabled={edge || isMoving}
            onClick={() => move(role, direction)}
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
          </Button>
        ))}
      </div>
    );
  }

  function rowEditor(role: VolunteerAdminRole | undefined, index: number) {
    const formId = `${baseId}-row-form`;
    return (
      <TableRow data-state="selected" className="align-top">
        <TableCell className="py-3 align-top md:pl-6">
          {role && moveButtons(role, index)}
        </TableCell>
        <TableCell className="px-3 py-3 align-top">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormControl>
                  <Input
                    type="text"
                    aria-label="Nombre del rol"
                    maxLength={120}
                    className="h-9 min-w-48"
                    autoFocus
                    form={formId}
                    {...field}
                  />
                </FormControl>
                <FormMessage className={rowErrorClass} />
              </FormItem>
            )}
          />
        </TableCell>
        <TableCell className="px-3 py-3 align-top">
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormControl>
                  <Textarea
                    aria-label="Descripción del rol"
                    maxLength={300}
                    rows={2}
                    className="min-h-16 min-w-56"
                    form={formId}
                    {...field}
                  />
                </FormControl>
                <FormMessage className={rowErrorClass} />
              </FormItem>
            )}
          />
        </TableCell>
        <TableCell className="px-3 py-3 align-top text-right tabular-nums">
          <div className="flex h-9 items-center justify-end">
            {role ? role.choiceCount : "—"}
          </div>
        </TableCell>
        <TableCell className="px-3 py-3 align-top">
          {role && (
            <div className="flex h-9 items-center">
              <VolunteerSetupActiveToggle
                checked={role.isActive}
                label={`${role.name}, activo`}
                onToggle={toggle(role)}
              />
            </div>
          )}
        </TableCell>
        <TableCell className="py-3 align-top md:pr-6">
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
    );
  }

  function cardEditor(role: VolunteerAdminRole | undefined) {
    return (
      <form
        onSubmit={save}
        noValidate
        className="grid min-w-0 gap-3"
        aria-label={role ? `Editar ${role.name}` : "Nuevo rol"}
      >
        <TextInput
          name="name"
          label="Nombre del rol"
          type="text"
          maxLength={120}
          className="min-w-0"
          autoFocus
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem className="grid min-w-0 gap-2">
              <FormLabel>Descripción</FormLabel>
              <FormControl>
                <Textarea
                  maxLength={300}
                  rows={3}
                  className="min-w-0"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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

  const empty = roles.length === 0 && editing !== "new";
  const emptyCopy =
    "Todavía no hay roles. Agregá al menos dos: quien se postula elige una primera y una segunda opción.";

  return (
    <Card role="region" aria-labelledby="volunteer-roles-title">
      <Form {...form}>
        <SetupCardHeader
          titleId="volunteer-roles-title"
          title="Roles"
          description="Aparecen en la página y en el formulario en este orden. Un rol que alguien ya eligió no se puede borrar, solo desactivar."
          addLabel="Agregar rol"
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
                <TableHead className="w-24 md:pl-6">Orden</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Lo eligieron</TableHead>
                <TableHead>Activo</TableHead>
                <TableHead className="md:pr-6">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {editing === "new" && rowEditor(undefined, -1)}
              {empty && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={6}
                    className="text-muted-foreground md:px-6"
                  >
                    {emptyCopy}
                  </TableCell>
                </TableRow>
              )}
              {roles.map((role, index) =>
                editing === role.id ? (
                  <Fragment key={role.id}>{rowEditor(role, index)}</Fragment>
                ) : (
                  <TableRow
                    key={role.id}
                    className={cn(!role.isActive && "text-muted-foreground")}
                  >
                    <TableCell className="md:pl-6">
                      {moveButtons(role, index)}
                    </TableCell>
                    <TableCell className="font-semibold break-words">
                      {role.name}
                    </TableCell>
                    <TableCell className="break-words text-muted-foreground">
                      {role.description}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {role.choiceCount}
                    </TableCell>
                    <TableCell>
                      <VolunteerSetupActiveToggle
                        checked={role.isActive}
                        label={`${role.name}, activo`}
                        onToggle={toggle(role)}
                      />
                    </TableCell>
                    <TableCell className="text-right md:pr-6">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Editar ${role.name}`}
                        onClick={() => open(role.id)}
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
                {emptyCopy}
              </li>
            )}
            {roles.map((role, index) => (
              <li
                key={role.id}
                className={cn(
                  "min-w-0 space-y-2 rounded-lg border p-3",
                  editing === role.id && "border-primary bg-primary/5",
                )}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div
                    className={cn(
                      "min-w-0 space-y-0.5",
                      !role.isActive && "text-muted-foreground",
                    )}
                  >
                    <p className="font-semibold break-words">{role.name}</p>
                    <p className="text-sm break-words text-muted-foreground">
                      {role.description}
                    </p>
                  </div>
                  <VolunteerSetupActiveToggle
                    checked={role.isActive}
                    label={`${role.name}, activo`}
                    onToggle={toggle(role)}
                    showLabel
                  />
                </div>
                <p className="text-sm">
                  <span className="text-muted-foreground">Lo eligieron </span>
                  <span className="font-medium tabular-nums">
                    {role.choiceCount}
                  </span>
                </p>
                {editing === role.id ? (
                  <div className="border-t pt-3">{cardEditor(role)}</div>
                ) : (
                  <div className="flex min-w-0 items-center gap-2">
                    {moveButtons(role, index, true)}
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 flex-1"
                      aria-label={`Editar ${role.name}`}
                      onClick={() => open(role.id)}
                      disabled={isSaving}
                    >
                      Editar
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Form>
    </Card>
  );
}
