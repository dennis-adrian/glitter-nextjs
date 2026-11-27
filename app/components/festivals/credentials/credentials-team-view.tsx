"use client";

import { AlertTriangleIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { useCredentials } from "@/app/components/festivals/credentials/credentials-context";
import ExternalQuantityField from "@/app/components/festivals/credentials/external-quantity-field";
import ExtraCredentialDialog from "@/app/components/festivals/credentials/extra-credential-dialog";
import StaffMemberDialog from "@/app/components/festivals/credentials/staff-member-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/app/components/ui/alert-dialog";
import { Badge } from "@/app/components/ui/badge";
import { Button, buttonVariants } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  removeExtraCredential,
  restoreStaffMember,
  setFestivalStaffMember,
} from "@/app/lib/credentials/actions";
import {
  buildHolders,
  type CredentialExtraRow,
  type CredentialsData,
  type CredentialStaffRow,
} from "@/app/lib/credentials/calculate";
import { CREDENTIALS_COPY, extraCredentialUnitKey } from "@/app/lib/credentials/definitions";
import { toastActionError } from "@/app/lib/errors/action-error";
import { cn } from "@/app/lib/utils";

const number = (value: number) => value.toLocaleString("es-BO");

function StaffRow({ festivalId, member }: { festivalId: number; member: CredentialStaffRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useOptimistic(member.selected);

  function toggle(next: boolean) {
    startTransition(async () => {
      setSelected(next);
      try {
        const result = await setFestivalStaffMember({
          festivalId,
          staffMemberId: member.id,
          selected: next,
        });
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        router.refresh();
      } catch (error) {
        toastActionError(error, CREDENTIALS_COPY.genericError);
      }
    });
  }

  return (
    <li className="flex items-center gap-3 px-4 py-2 md:px-6">
      <Checkbox
        checked={selected}
        disabled={isPending || (!member.isActive && !selected)}
        aria-label={`Incluir a ${member.fullName} en esta edición`}
        onCheckedChange={(value) => toggle(value === true)}
        className="shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
        <span className="font-medium wrap-anywhere">{member.fullName}</span>
        <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="break-words">{member.roleLabel || "Sin rol"}</span>
          {!member.isActive && <Badge variant="outline">Archivada</Badge>}
        </span>
      </div>
      <div className="shrink-0">
        <StaffMemberDialog festivalId={festivalId} member={member} />
      </div>
    </li>
  );
}

/**
 * An archived member not selected for this festival: no checkbox, since
 * archived members are not offered for new editions, only "Restaurar".
 */
function ArchivedStaffRow({
  festivalId,
  member,
}: {
  festivalId: number;
  member: CredentialsData["archivedStaff"][number];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function restore() {
    startTransition(async () => {
      try {
        const result = await restoreStaffMember({ festivalId, staffMemberId: member.id });
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        router.refresh();
      } catch (error) {
        toastActionError(error, CREDENTIALS_COPY.genericError);
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 md:px-6">
      <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-0.5 py-1">
        <span className="font-medium wrap-anywhere">{member.fullName}</span>
        <span className="break-words text-xs text-muted-foreground">
          {member.roleLabel || "Sin rol"}
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        disabled={isPending}
        aria-label={`Restaurar a ${member.fullName}`}
        onClick={restore}
      >
        Restaurar
      </Button>
    </li>
  );
}

function ExtraRow({
  festivalId,
  extra,
  printed,
}: {
  festivalId: number;
  extra: CredentialExtraRow;
  printed: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Controlled, so the server can open it too: `printed` comes from the
  // history this screen loaded, which can predate the latest batch.
  const [confirming, setConfirming] = useState(false);
  const title = extra.name ?? extra.label;

  function remove(confirmPrinted: boolean) {
    startTransition(async () => {
      try {
        const result = await removeExtraCredential({
          festivalId,
          extraCredentialId: extra.id,
          confirmPrinted,
        });
        if (!result.success) {
          if ("needsConfirmation" in result) {
            setConfirming(true);
            router.refresh();
            return;
          }
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        router.refresh();
      } catch (error) {
        toastActionError(error, CREDENTIALS_COPY.genericError);
      }
    });
  }

  const removeButton = (onClick?: () => void) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending}
      aria-label={`Quitar ${title}`}
      onClick={onClick}
    >
      Quitar
    </Button>
  );

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
      <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-0.5">
        <span className="font-medium wrap-anywhere">{title}</span>
        <span className="break-words text-xs text-muted-foreground">
          {extra.name != null
            ? `${extra.label} · con nombre`
            : `${number(extra.quantity)} ${extra.quantity === 1 ? "credencial sin nombre" : "credenciales sin nombre"}`}
        </span>
      </div>
      <div className="flex shrink-0 gap-1">
        <ExtraCredentialDialog festivalId={festivalId} extra={extra} />
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          {printed ? (
            <AlertDialogTrigger asChild>{removeButton()}</AlertDialogTrigger>
          ) : (
            // Not printed as far as this screen knows: a plain button with no
            // warning, unless the server answers it was printed meanwhile.
            removeButton(() => remove(false))
          )}
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="wrap-anywhere">¿Quitar {title}?</AlertDialogTitle>
              <AlertDialogDescription>
                Ya se mandó a imprenta. Si la quitás, figura en Nombres como «Ya no
                corresponde».
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => remove(true)}>Quitar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

/** Equipo y externos (M3). */
export default function CredentialsTeamView() {
  const { festivalId, data, rules } = useCredentials();
  // Over the roster shown: the active members plus archived ones still
  // selected here, who keep their credential.
  const selectedCount = data.staff.filter((member) => member.selected).length;
  const printedUnits = new Set(
    data.batches.flatMap((batch) => batch.items.map((item) => item.unitKey)),
  );
  const overrides = new Map(
    data.externalOverrides.map((row) => [row.externalParticipantId, row.quantity]),
  );
  const externals = buildHolders(data, rules).holders.filter(
    (holder) => holder.kind === "external",
  );
  const externalsTotal = externals.reduce((sum, holder) => sum + holder.named, 0);
  const { accepted, withoutRole, waiting } = data.volunteerCounts;

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[999_1_35rem] flex-col gap-6">
        <Card className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3 p-4 md:p-6">
            <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1.5">
              <CardTitle className="text-lg">Equipo Glitter</CardTitle>
              <CardDescription>
                La lista se guarda para todas las ediciones. Marcá quiénes trabajan en esta:{" "}
                {number(selectedCount)} de {number(data.staff.length)}.
              </CardDescription>
            </div>
            <StaffMemberDialog festivalId={festivalId} />
          </div>
          {data.staff.length === 0 ? (
            <p className="border-t px-4 py-6 text-sm text-muted-foreground md:px-6">
              Todavía no hay nadie en la lista del equipo.
            </p>
          ) : (
            <ul className="divide-y border-t" aria-label="Equipo Glitter">
              {data.staff.map((member) => (
                <StaffRow key={member.id} festivalId={festivalId} member={member} />
              ))}
            </ul>
          )}
          {data.archivedStaff.length > 0 && (
            <details className="border-t">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium md:px-6">
                Archivadas ({number(data.archivedStaff.length)})
              </summary>
              <p className="px-4 pb-2 text-xs text-muted-foreground md:px-6">
                No se ofrecen para esta edición. Restaurá a quien vuelva al equipo.
              </p>
              <ul className="divide-y border-t" aria-label="Archivadas">
                {data.archivedStaff.map((member) => (
                  <ArchivedStaffRow key={member.id} festivalId={festivalId} member={member} />
                ))}
              </ul>
            </details>
          )}
        </Card>

        <Card className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3 p-4 md:p-6">
            <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1.5">
              <CardTitle className="text-lg">Solo para esta edición</CardTitle>
              <CardDescription>
                Personas invitadas, prensa o apoyo puntual que no forman parte del equipo fijo.
              </CardDescription>
            </div>
            <ExtraCredentialDialog festivalId={festivalId} />
          </div>
          {data.extras.length === 0 ? (
            <p className="border-t px-4 py-6 text-sm text-muted-foreground md:px-6">
              No hay credenciales extra para esta edición.
            </p>
          ) : (
            <ul className="divide-y border-t" aria-label="Solo para esta edición">
              {data.extras.map((extra) => (
                <ExtraRow
                  key={extra.id}
                  festivalId={festivalId}
                  extra={extra}
                  printed={printedUnits.has(extraCredentialUnitKey(extra.id))}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="flex min-w-0 flex-[1_1_20rem] flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Participantes externos</CardTitle>
            <CardDescription>
              Llevan el nombre de la organización. Ajustá cuántas necesita cada una; si no tocás
              nada se usan {number(rules.external.quantity)} por espacio.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {externals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ningún participante externo tiene un espacio en esta edición.
              </p>
            ) : (
              externals.map((holder) => {
                const externalId = Number(holder.key.split(":")[1]);
                return (
                  <div key={holder.key} className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-medium wrap-anywhere">{holder.name}</span>
                      <span className="break-words text-xs text-muted-foreground">
                        {[holder.note, holder.standLabel].filter(Boolean).join(" · ")}
                      </span>
                      {holder.standsChanged && (
                        <span className="flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-200">
                          <AlertTriangleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Cambió la cantidad de espacios
                        </span>
                      )}
                    </div>
                    <div className="shrink-0">
                      <ExternalQuantityField
                        festivalId={festivalId}
                        externalParticipantId={externalId}
                        name={holder.name}
                        override={overrides.get(externalId) ?? null}
                        defaultQuantity={rules.external.quantity * holder.standCount}
                        standCount={holder.standCount}
                      />
                    </div>
                  </div>
                );
              })
            )}
            <div className="h-px bg-border" />
            <div className="flex justify-between gap-3 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">
                {number(externalsTotal)} {externalsTotal === 1 ? "credencial" : "credenciales"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Voluntarios</CardTitle>
            <CardDescription>
              Se toman solos de todas las postulaciones aceptadas, tengan rol o no: la credencial
              lleva el rol asignado o «{CREDENTIALS_COPY.noRole}». Acá no hay nada que cargar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Aceptadas</dt>
                <dd className="font-semibold tabular-nums">{number(accepted)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Sin rol asignado</dt>
                <dd>
                  {withoutRole > 0 ? (
                    <Badge variant="amber">{number(withoutRole)} sin rol</Badge>
                  ) : (
                    <span className="tabular-nums">0</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">En espera o pendientes</dt>
                <dd className="text-right tabular-nums">
                  {number(waiting)}, no se cuentan
                </dd>
              </div>
            </dl>
            <Link
              href={`/dashboard/festivals/${festivalId}/volunteers`}
              className={cn(buttonVariants({ variant: "link", size: "inline" }), "mt-3 -ml-3")}
            >
              Ir a voluntarios
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
