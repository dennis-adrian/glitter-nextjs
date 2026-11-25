"use client";

import { useCredentials } from "@/app/components/festivals/credentials/credentials-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Label } from "@/app/components/ui/label";
import { Switch } from "@/app/components/ui/switch";
import type { ToggleableCredentialGroup } from "@/app/lib/credentials/definitions";

function count(value: number, one: string, many: string) {
  return `${value.toLocaleString("es-BO")} ${value === 1 ? one : many}`;
}

/**
 * "Qué se cuenta": which reservations and groups the page counts. Client
 * state mirrored to the URL; nothing here is saved.
 */
export default function CredentialsSourcesCard({
  groups = ["external", "volunteer", "staff"],
}: {
  /** The group switches this build offers. */
  groups?: readonly ToggleableCredentialGroup[];
}) {
  const { filters, setFilters, view } = useCredentials();
  const { reservations, externals, volunteers, staff } = view.sources;

  const setStatus = (status: "verification_payment" | "pending", on: boolean) =>
    setFilters({ ...filters, statuses: { ...filters.statuses, [status]: on } });
  const setGroup = (group: ToggleableCredentialGroup, on: boolean) =>
    setFilters({ ...filters, groups: { ...filters.groups, [group]: on } });

  const switches: Record<
    ToggleableCredentialGroup,
    { id: string; label: string; hint: string }
  > = {
    external: {
      id: "credentials-group-external",
      label: "Participantes externos",
      hint: `${count(externals, "con espacio asignado", "con espacio asignado")}`,
    },
    volunteer: {
      id: "credentials-group-volunteer",
      label: "Voluntarios",
      hint: count(volunteers, "postulación aceptada", "postulaciones aceptadas"),
    },
    staff: {
      id: "credentials-group-staff",
      label: "Equipo Glitter",
      hint: count(staff, "persona en esta edición", "personas en esta edición"),
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Qué se cuenta</CardTitle>
        <CardDescription>Los números de esta página cambian al instante.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <fieldset className="flex min-w-0 flex-col gap-3">
          <legend className="mb-3 text-xs font-semibold text-muted-foreground">
            Reservas
          </legend>
          <div className="flex items-start gap-3">
            <Checkbox id="credentials-status-accepted" checked disabled />
            <div className="flex min-w-0 flex-col gap-0.5">
              <Label htmlFor="credentials-status-accepted">Confirmadas</Label>
              <span className="text-xs text-muted-foreground">
                {count(reservations.accepted, "reserva", "reservas")}. Siempre se cuentan.
              </span>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="credentials-status-verification"
              checked={filters.statuses.verification_payment}
              onCheckedChange={(value) => setStatus("verification_payment", value === true)}
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <Label htmlFor="credentials-status-verification">En verificación de pago</Label>
              <span className="text-xs text-muted-foreground">
                {count(
                  reservations.verification_payment,
                  "reserva con comprobante por revisar",
                  "reservas con comprobante por revisar",
                )}
                .
              </span>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="credentials-status-pending"
              checked={filters.statuses.pending}
              onCheckedChange={(value) => setStatus("pending", value === true)}
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <Label htmlFor="credentials-status-pending">Pendientes</Label>
              <span className="text-xs text-muted-foreground">
                {count(
                  reservations.pending,
                  "reserva que todavía no pagó",
                  "reservas que todavía no pagaron",
                )}
                .
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Las rechazadas, canceladas y liberadas nunca se cuentan.
          </p>
        </fieldset>
        {groups.length > 0 && (
          <>
            <div className="h-px bg-border" />
            <fieldset className="flex min-w-0 flex-col gap-3">
              <legend className="mb-3 text-xs font-semibold text-muted-foreground">
                Otros grupos
              </legend>
              {groups.map((group) => {
                const item = switches[group];
                return (
                  <div key={group} className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Label htmlFor={item.id}>{item.label}</Label>
                      <span className="text-xs text-muted-foreground">{item.hint}</span>
                    </div>
                    <Switch
                      id={item.id}
                      checked={filters.groups[group]}
                      onCheckedChange={(value) => setGroup(group, value)}
                    />
                  </div>
                );
              })}
            </fieldset>
          </>
        )}
      </CardContent>
    </Card>
  );
}
