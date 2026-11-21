"use client";

import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
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
import { Textarea } from "@/app/components/ui/textarea";
import VolunteerSetupActiveToggle from "@/app/components/volunteers/admin/volunteer-setup-active-toggle";
import {
  fieldErrors,
  SetupCardHeader,
  SetupFieldError,
} from "@/app/components/volunteers/admin/volunteer-setup-parts";
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
import {
  volunteerRoleInputSchema,
  type VolunteerRoleInput,
} from "@/app/lib/volunteers/admin-schema";

type RoleDraft = { name: string; description: string };
type DraftField = keyof RoleDraft;
type Editing = number | "new" | null;
type Direction = "up" | "down";

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
  const [draft, setDraft] = useState<RoleDraft>(() => {
    const role = roles.find((candidate) => candidate.id === initialEditing);
    return { name: role?.name ?? "", description: role?.description ?? "" };
  });
  const [errors, setErrors] = useState<Partial<Record<DraftField, string>>>({});
  const [isSaving, startSaving] = useTransition();
  const [isMoving, startMoving] = useTransition();

  function open(target: Exclude<Editing, null>) {
    const role =
      target === "new" ? undefined : roles.find((r) => r.id === target);
    setEditing(target);
    setErrors({});
    setDraft({ name: role?.name ?? "", description: role?.description ?? "" });
  }

  function close() {
    setEditing(null);
    setErrors({});
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

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editing === null || isSaving) return;
    // No sortOrder: a new role goes last, an edited one keeps its place.
    const input: VolunteerRoleInput = {
      festivalId,
      roleId: editing === "new" ? undefined : editing,
      ...draft,
    };
    const parsed = volunteerRoleInputSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrors<DraftField>(parsed.error.issues));
      return;
    }
    setErrors({});
    startSaving(async () => {
      if (await settle(() => saveVolunteerRole(input))) close();
    });
  }

  function move(role: VolunteerAdminRole, direction: Direction) {
    startMoving(async () => {
      await settle(() =>
        moveVolunteerRole({ festivalId, roleId: role.id, direction }),
      );
    });
  }

  const toggle = (role: VolunteerAdminRole) => (isActive: boolean) =>
    setVolunteerRoleActive({ festivalId, id: role.id, isActive });

  function field(layout: "row" | "card", name: DraftField) {
    const errorId = `${baseId}-${layout}-${name}-error`;
    return {
      props: {
        id: `${baseId}-${layout}-${name}`,
        value: draft[name],
        onChange: (event: { target: { value: string } }) =>
          setDraft((current) => ({ ...current, [name]: event.target.value })),
        "aria-invalid": errors[name] ? true : undefined,
        "aria-describedby": errors[name] ? errorId : undefined,
      },
      error: <SetupFieldError id={errorId} message={errors[name]} />,
    };
  }

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
    const name = field("row", "name");
    const description = field("row", "description");
    return (
      <TableRow data-state="selected" className="align-top">
        <TableCell className="py-3 align-top md:pl-6">
          {role && moveButtons(role, index)}
        </TableCell>
        <TableCell className="px-3 py-3 align-top">
          <Input
            type="text"
            aria-label="Nombre del rol"
            maxLength={120}
            className="h-9 min-w-48"
            autoFocus
            form={formId}
            {...name.props}
          />
          {name.error}
        </TableCell>
        <TableCell className="px-3 py-3 align-top">
          <Textarea
            aria-label="Descripción del rol"
            maxLength={300}
            rows={2}
            className="min-h-16 min-w-56"
            form={formId}
            {...description.props}
          />
          {description.error}
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
            <Button type="submit" size="sm" disabled={isSaving}>
              {isSaving ? "Guardando..." : "Guardar"}
            </Button>
          </form>
        </TableCell>
      </TableRow>
    );
  }

  function cardEditor(role: VolunteerAdminRole | undefined) {
    const name = field("card", "name");
    const description = field("card", "description");
    return (
      <form
        onSubmit={save}
        noValidate
        className="grid min-w-0 gap-3"
        aria-label={role ? `Editar ${role.name}` : "Nuevo rol"}
      >
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={name.props.id}>Nombre del rol</Label>
          <Input
            type="text"
            maxLength={120}
            className="min-w-0"
            autoFocus
            {...name.props}
          />
          {name.error}
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={description.props.id}>Descripción</Label>
          <Textarea
            maxLength={300}
            rows={3}
            className="min-w-0"
            {...description.props}
          />
          {description.error}
        </div>
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

  const empty = roles.length === 0 && editing !== "new";
  const emptyCopy =
    "Todavía no hay roles. Agregá al menos dos: quien se postula elige una primera y una segunda opción.";

  return (
    <Card role="region" aria-labelledby="volunteer-roles-title">
      <SetupCardHeader
        titleId="volunteer-roles-title"
        title="Roles"
        description="Aparecen en la página y en el formulario en este orden. Un rol que alguien ya eligió no se puede borrar, solo desactivar."
        addLabel="Agregar rol"
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
                  >
                    Editar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
