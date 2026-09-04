"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import FullTableReadinessList from "@/app/components/festivals/full-table-readiness";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Switch } from "@/app/components/ui/switch";
import { formatDateWithTime } from "@/app/lib/formatters";
import {
  FEATURE_NOT_IMPLEMENTED_REASON,
  isFeatureTypeImplemented,
} from "@/app/lib/festivals/feature-config";
import { upsertFestivalFeatureConfigAction } from "@/app/lib/festivals/feature-config-actions";
import type { FestivalFeatureScope } from "@/app/lib/festivals/feature-config-service";
import type { FullTableReadiness } from "@/app/lib/stands/full-table-queries";

const TYPE_LABELS: Record<string, string> = {
  full_table: "Mesa completa",
  late_partner: "Agregar compañero",
  reservation_release: "Liberar reserva",
};

const CATEGORY_LABELS: Record<string, string> = {
  illustration: "Ilustración",
  entrepreneurship: "Emprendimiento",
};

function toLocalInputValue(date: Date | null) {
  if (!date) return "";
  // datetime-local wants local time without a zone suffix.
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

type FestivalFeatureConfigRowProps = {
  festivalId: number;
  scope: FestivalFeatureScope;
  canEdit: boolean;
  /**
   * What this scope's category still needs before participants are offered a
   * table, or null where the feature has no inventory of its own. Enabling and
   * pricing is not enough to make an offer appear, and every remaining gate is
   * silent from the participant's side.
   */
  readiness: FullTableReadiness | null;
  /** Whether the `credits` flag is public. Global, not per category. */
  creditsLaunched: boolean;
};

export default function FestivalFeatureConfigRow({
  festivalId,
  scope,
  canEdit,
  readiness,
  creditsLaunched,
}: FestivalFeatureConfigRowProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(scope.config?.enabled ?? false);
  const [price, setPrice] = useState(
    scope.config ? String(scope.config.creditPrice.toFixed(2)) : "",
  );
  const [deadline, setDeadline] = useState(
    toLocalInputValue(scope.config?.deadlineOverrideAt ?? null),
  );

  const isLatePartner = scope.type === "late_partner";
  // Phases 4 and 5 have configuration rows and no implementation. The row stays
  // visible with its reason rather than disappearing: a switch that vanished
  // would read as a feature that never existed, and admins already know these
  // are coming.
  const implemented = isFeatureTypeImplemented(scope.type);
  // Whether the stored row is on, not the switch: an unimplemented feature that
  // somebody enabled before the panel started refusing it has to stay
  // correctable. The service allows turning one off for exactly that reason, so
  // the switch and Guardar stay live for it while price and deadline — the
  // parts that only matter once it can be offered — stay locked.
  const enabledOnServer = scope.config?.enabled ?? false;
  const editable = canEdit && implemented;
  const canToggle = canEdit && (implemented || enabledOnServer);
  // Turning it back on is the one thing the service would refuse, so Guardar
  // says so before the round trip rather than after it.
  const canSave = canToggle && (implemented || !enabled);
  const priceValue = Number(price);
  const priceValid =
    price.trim() !== "" &&
    Number.isFinite(priceValue) &&
    priceValue >= 0 &&
    Math.abs(Math.round(priceValue * 100) / 100 - priceValue) < 1e-9;

  const title = scope.category
    ? `${TYPE_LABELS[scope.type]} · ${CATEGORY_LABELS[scope.category]}`
    : TYPE_LABELS[scope.type];

  function save() {
    startTransition(async () => {
      try {
        const result = await upsertFestivalFeatureConfigAction({
          festivalId,
          type: scope.type,
          category: scope.category,
          enabled,
          creditPrice: priceValue,
          deadlineOverrideAt:
            isLatePartner && deadline ? new Date(deadline).toISOString() : null,
        });
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        router.refresh();
      } catch (error) {
        console.error("Error saving feature config", error);
        toast.error("Error al guardar la configuración.");
      }
    });
  }

  return (
    <div className="space-y-3 rounded-md border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">
            Precio en créditos (1 crédito = Bs 1).
          </p>
        </div>
        {scope.config?.available ? (
          <Badge variant="green">Disponible</Badge>
        ) : (
          <Badge variant="secondary">No disponible</Badge>
        )}
      </div>

      {!implemented && (
        <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
          {FEATURE_NOT_IMPLEMENTED_REASON} Va a habilitarse cuando se publique.
          {enabledOnServer ? " Podés desactivarla mientras tanto." : ""}
        </p>
      )}

      {implemented && readiness && (
        <FullTableReadinessList
          readiness={readiness}
          creditsLaunched={creditsLaunched}
          enabled={scope.config?.enabled ?? false}
        />
      )}

      {implemented && scope.config?.unavailableReason && (
        <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
          {scope.config.unavailableReason}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={!canToggle || isPending}
          />
          <span className="text-sm">Activada</span>
        </label>

        <div className="grid gap-1">
          <Label htmlFor={`price-${scope.type}-${scope.category ?? "all"}`}>
            Precio
          </Label>
          <Input
            id={`price-${scope.type}-${scope.category ?? "all"}`}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            className="w-32"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            disabled={!editable || isPending}
            placeholder="0.00"
          />
        </div>

        {isLatePartner && (
          <div className="grid gap-1">
            <Label htmlFor="late-partner-deadline">Fecha límite</Label>
            <Input
              id="late-partner-deadline"
              type="datetime-local"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              disabled={!editable || isPending}
            />
          </div>
        )}
      </div>

      {isLatePartner && (
        <p className="text-xs text-muted-foreground">
          {scope.config?.effectiveDeadlineAt
            ? `Fecha límite vigente: ${formatDateWithTime(scope.config.effectiveDeadlineAt)}.`
            : "Sin fecha límite: se calcula desde el inicio del festival menos 21 días, o definila acá."}{" "}
          Dejala vacía para volver al cálculo automático.
        </p>
      )}

      {canEdit ? (
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={!canSave || !priceValid || isPending}
        >
          {isPending ? "Guardando..." : "Guardar"}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Solo un administrador general puede cambiar esta configuración.
        </p>
      )}
    </div>
  );
}
