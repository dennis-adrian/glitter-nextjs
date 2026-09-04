"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

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
   * Full tables declared for this scope's category, or null where the feature
   * has no inventory of its own. Enabling and pricing is not enough to make an
   * offer appear, and without this the shortfall is invisible from here.
   */
  declaredTables: number | null;
};

export default function FestivalFeatureConfigRow({
  festivalId,
  scope,
  canEdit,
  declaredTables,
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
  const editable = canEdit && implemented;
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
        </p>
      )}

      {implemented && declaredTables === 0 && scope.config?.enabled && (
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          No hay ninguna mesa completa declarada en esta categoría, así que no
          se le ofrece a nadie. Declarala desde la gestión de espacios,
          seleccionando las dos mitades.
        </p>
      )}

      {implemented && declaredTables != null && declaredTables > 0 && (
        <p className="text-xs text-muted-foreground">
          {declaredTables} mesa{declaredTables === 1 ? "" : "s"} completa
          {declaredTables === 1 ? "" : "s"} declarada
          {declaredTables === 1 ? "" : "s"} en esta categoría.
        </p>
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
            disabled={!editable || isPending}
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
          disabled={!editable || !priceValid || isPending}
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
