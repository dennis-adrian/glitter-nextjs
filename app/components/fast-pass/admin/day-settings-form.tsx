"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import TextInput from "@/app/components/form/fields/text";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Form } from "@/app/components/ui/form";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Switch } from "@/app/components/ui/switch";
import { Textarea } from "@/app/components/ui/textarea";
import FastPassCancelFestivalDayForm from "@/app/components/fast-pass/admin/cancel-festival-day-form";
import {
  pauseOnSiteSales,
  pauseOnlineSales,
  resumeOnSiteSales,
  resumeOnlineSales,
  upsertDaySettings,
} from "@/app/lib/fast-pass/admin-actions";
import type { FastPassDaySettingsBundle } from "@/app/lib/fast-pass/inventory-queries";
import { formatFullDate } from "@/app/lib/formatters";

const settingsSchema = z
  .object({
    offeringEnabled: z.boolean(),
    onlineSalesEnabled: z.boolean(),
    onSiteSalesEnabled: z.boolean(),
    price: z.coerce.number().positive("El precio debe ser mayor que cero"),
    salesStartAt: z.string().optional(),
    salesEndAt: z.string().optional(),
    paidInventoryLimit: z.coerce.number().int().positive(),
    priorityCapacityLimit: z.coerce.number().int().positive(),
    onlinePaidAllocation: z.coerce.number().int().min(0),
    onSitePaidAllocation: z.coerce.number().int().min(0),
    onlinePriorityAllocation: z.coerce.number().int().min(0),
    onSitePriorityAllocation: z.coerce.number().int().min(0),
    maxPaidPassesPerPurchase: z.coerce.number().int().positive().max(50),
    bankQrImageUrl: z
      .string()
      .trim()
      .max(2000)
      .refine(
        (value) => value === "" || z.string().url().safeParse(value).success,
        {
          message: "URL inválida",
        },
      ),
    onSiteBankQrEnabled: z.boolean(),
    onSiteCashEnabled: z.boolean(),
    onSiteProofRequired: z.boolean(),
    onSiteVisitorDetailsRequired: z.boolean(),
    notifyOnSale: z.boolean(),
    notifyOnCancellation: z.boolean(),
    notificationEmails: z.string(),
  })
  .superRefine((data, context) => {
    if (data.onSiteBankQrEnabled && !data.bankQrImageUrl) {
      context.addIssue({
        code: "custom",
        path: ["bankQrImageUrl"],
        message: "La imagen QR bancaria es obligatoria",
      });
    }
    if (
      data.onlinePaidAllocation + data.onSitePaidAllocation >
      data.paidInventoryLimit
    ) {
      context.addIssue({
        code: "custom",
        path: ["onSitePaidAllocation"],
        message: "Las asignaciones pagadas superan el inventario total",
      });
    }
    if (
      data.onlinePriorityAllocation + data.onSitePriorityAllocation >
      data.priorityCapacityLimit
    ) {
      context.addIssue({
        code: "custom",
        path: ["onSitePriorityAllocation"],
        message: "Las asignaciones prioritarias superan la capacidad total",
      });
    }
    const salesStartAt = parseLocalInputValue(data.salesStartAt);
    const salesEndAt = parseLocalInputValue(data.salesEndAt);
    if (salesStartAt && salesEndAt && salesEndAt < salesStartAt) {
      context.addIssue({
        code: "custom",
        path: ["salesEndAt"],
        message: "La fecha de fin no puede ser anterior al inicio",
      });
    }
  });

type SettingsInput = z.input<typeof settingsSchema>;
type SettingsValues = z.output<typeof settingsSchema>;

export type FastPassDateOption = {
  festivalDateId: number;
  startDate: Date;
};

type Props = {
  festivalId: number;
  dates: FastPassDateOption[];
  initialDateId: number | null;
  initialBundle: FastPassDaySettingsBundle | null;
};

function toLocalInputValue(date: Date | null | undefined): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseLocalInputValue(value: string | undefined): Date | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function bundleToDefaults(
  bundle: FastPassDaySettingsBundle | null,
): SettingsInput {
  if (!bundle) {
    return {
      offeringEnabled: false,
      onlineSalesEnabled: false,
      onSiteSalesEnabled: false,
      price: "",
      salesStartAt: "",
      salesEndAt: "",
      paidInventoryLimit: 100,
      priorityCapacityLimit: 150,
      onlinePaidAllocation: 50,
      onSitePaidAllocation: 50,
      onlinePriorityAllocation: 75,
      onSitePriorityAllocation: 75,
      maxPaidPassesPerPurchase: 10,
      bankQrImageUrl: "",
      onSiteBankQrEnabled: true,
      onSiteCashEnabled: false,
      onSiteProofRequired: true,
      onSiteVisitorDetailsRequired: false,
      notifyOnSale: false,
      notifyOnCancellation: false,
      notificationEmails: "",
    };
  }

  const { settings, notificationEmails } = bundle;
  return {
    offeringEnabled: settings.offeringEnabled,
    onlineSalesEnabled: settings.onlineSalesEnabled,
    onSiteSalesEnabled: settings.onSiteSalesEnabled,
    price: settings.price,
    salesStartAt: toLocalInputValue(settings.salesStartAt),
    salesEndAt: toLocalInputValue(settings.salesEndAt),
    paidInventoryLimit: settings.paidInventoryLimit,
    priorityCapacityLimit: settings.priorityCapacityLimit,
    onlinePaidAllocation: settings.onlinePaidAllocation,
    onSitePaidAllocation: settings.onSitePaidAllocation,
    onlinePriorityAllocation: settings.onlinePriorityAllocation,
    onSitePriorityAllocation: settings.onSitePriorityAllocation,
    maxPaidPassesPerPurchase: settings.maxPaidPassesPerPurchase,
    bankQrImageUrl: settings.bankQrImageUrl ?? "",
    onSiteBankQrEnabled: settings.onSiteBankQrEnabled,
    onSiteCashEnabled: settings.onSiteCashEnabled,
    onSiteProofRequired: settings.onSiteProofRequired,
    onSiteVisitorDetailsRequired: settings.onSiteVisitorDetailsRequired,
    notifyOnSale: settings.notifyOnSale,
    notifyOnCancellation: settings.notifyOnCancellation,
    notificationEmails: notificationEmails.join("\n"),
  };
}

export default function FastPassDaySettingsForm({
  festivalId,
  dates,
  initialDateId,
  initialBundle,
}: Props) {
  const router = useRouter();
  const [selectedDateId, setSelectedDateId] = useState<number | null>(
    initialDateId,
  );
  const [pending, setPending] = useState<
    | "save"
    | "pauseOnline"
    | "resumeOnline"
    | "pauseOnSite"
    | "resumeOnSite"
    | null
  >(null);

  const settingsId = initialBundle?.settings.id ?? null;

  const form = useForm<SettingsInput, unknown, SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: bundleToDefaults(initialBundle),
  });

  const settingsIdentity =
    initialBundle?.settings.id ??
    initialBundle?.settings.festivalDateId ??
    initialDateId;

  useEffect(() => {
    form.reset(bundleToDefaults(initialBundle));
  }, [form, initialBundle, settingsIdentity]);

  async function onSubmit(values: SettingsValues) {
    if (!selectedDateId) {
      toast.error("Selecciona un día de festival");
      return;
    }

    setPending("save");
    try {
      const emails = values.notificationEmails
        .split(/[\n,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);

      const result = await upsertDaySettings(selectedDateId, {
        ...values,
        salesStartAt: parseLocalInputValue(values.salesStartAt),
        salesEndAt: parseLocalInputValue(values.salesEndAt),
        notificationEmails: emails,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.refresh();
    } catch {
      toast.error("No pudimos guardar la configuración");
    } finally {
      setPending(null);
    }
  }

  async function togglePause(
    channel: "online" | "on_site",
    action: "pause" | "resume",
  ) {
    if (!settingsId) {
      toast.error("Guarda la configuración del día antes de pausar ventas");
      return;
    }

    const pendingKey =
      channel === "online"
        ? action === "pause"
          ? "pauseOnline"
          : "resumeOnline"
        : action === "pause"
          ? "pauseOnSite"
          : "resumeOnSite";

    setPending(pendingKey);
    try {
      const runner =
        channel === "online"
          ? action === "pause"
            ? pauseOnlineSales
            : resumeOnlineSales
          : action === "pause"
            ? pauseOnSiteSales
            : resumeOnSiteSales;

      const result = await runner(settingsId);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.refresh();
    } catch {
      toast.error("No pudimos actualizar las ventas");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Día de festival</CardTitle>
          <CardDescription>
            Configura Pase Rápido por cada fecha del festival
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedDateId ? String(selectedDateId) : undefined}
            onValueChange={(value) => {
              const nextId = parseInt(value, 10);
              setSelectedDateId(nextId);
              router.push(
                `/dashboard/festivals/${festivalId}/fast-pass/settings?dateId=${nextId}`,
              );
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona una fecha" />
            </SelectTrigger>
            <SelectContent>
              {dates.map((date) => (
                <SelectItem
                  key={date.festivalDateId}
                  value={String(date.festivalDateId)}
                >
                  {formatFullDate(date.startDate)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {!selectedDateId ? (
        <p className="text-sm text-muted-foreground">
          Selecciona un día para editar su configuración.
        </p>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Oferta y canales</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="offeringEnabled">Oferta habilitada</Label>
                  <Switch
                    id="offeringEnabled"
                    checked={form.watch("offeringEnabled")}
                    onCheckedChange={(checked) =>
                      form.setValue("offeringEnabled", checked)
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="onlineSalesEnabled">Ventas online</Label>
                  <Switch
                    id="onlineSalesEnabled"
                    checked={form.watch("onlineSalesEnabled")}
                    onCheckedChange={(checked) =>
                      form.setValue("onlineSalesEnabled", checked)
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="onSiteSalesEnabled">Ventas en sitio</Label>
                  <Switch
                    id="onSiteSalesEnabled"
                    checked={form.watch("onSiteSalesEnabled")}
                    onCheckedChange={(checked) =>
                      form.setValue("onSiteSalesEnabled", checked)
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending !== null || !settingsId}
                    onClick={() => togglePause("online", "pause")}
                  >
                    Pausar online
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending !== null || !settingsId}
                    onClick={() => togglePause("online", "resume")}
                  >
                    Reanudar online
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending !== null || !settingsId}
                    onClick={() => togglePause("on_site", "pause")}
                  >
                    Pausar en sitio
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending !== null || !settingsId}
                    onClick={() => togglePause("on_site", "resume")}
                  >
                    Reanudar en sitio
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Comercial</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <TextInput
                  name="price"
                  label="Precio por pase (Bs)"
                  type="number"
                  step="0.01"
                />
                <TextInput
                  name="maxPaidPassesPerPurchase"
                  label="Máximo de pases por compra"
                  type="number"
                />
                <div className="space-y-2">
                  <Label htmlFor="salesStartAt">Inicio de ventas</Label>
                  <input
                    id="salesStartAt"
                    type="datetime-local"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    {...form.register("salesStartAt")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salesEndAt">Fin de ventas</Label>
                  <input
                    id="salesEndAt"
                    type="datetime-local"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    {...form.register("salesEndAt")}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Inventario y asignaciones</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <TextInput
                  name="paidInventoryLimit"
                  label="Límite de pases pagos"
                  type="number"
                />
                <TextInput
                  name="priorityCapacityLimit"
                  label="Capacidad prioritaria"
                  type="number"
                />
                <TextInput
                  name="onlinePaidAllocation"
                  label="Asignación online (pagos)"
                  type="number"
                />
                <TextInput
                  name="onSitePaidAllocation"
                  label="Asignación en sitio (pagos)"
                  type="number"
                />
                <TextInput
                  name="onlinePriorityAllocation"
                  label="Asignación online (prioridad)"
                  type="number"
                />
                <TextInput
                  name="onSitePriorityAllocation"
                  label="Asignación en sitio (prioridad)"
                  type="number"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>En sitio</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="onSiteBankQrEnabled"
                    checked={form.watch("onSiteBankQrEnabled")}
                    onCheckedChange={(checked) =>
                      form.setValue("onSiteBankQrEnabled", checked === true)
                    }
                  />
                  <Label htmlFor="onSiteBankQrEnabled">QR bancario</Label>
                </div>
                <TextInput
                  name="bankQrImageUrl"
                  label="URL de imagen del QR bancario"
                  type="url"
                  placeholder="https://"
                />
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="onSiteCashEnabled"
                    checked={form.watch("onSiteCashEnabled")}
                    onCheckedChange={(checked) =>
                      form.setValue("onSiteCashEnabled", checked === true)
                    }
                  />
                  <Label htmlFor="onSiteCashEnabled">Efectivo</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="onSiteProofRequired"
                    checked={form.watch("onSiteProofRequired")}
                    onCheckedChange={(checked) =>
                      form.setValue("onSiteProofRequired", checked === true)
                    }
                  />
                  <Label htmlFor="onSiteProofRequired">
                    Comprobante obligatorio
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="onSiteVisitorDetailsRequired"
                    checked={form.watch("onSiteVisitorDetailsRequired")}
                    onCheckedChange={(checked) =>
                      form.setValue(
                        "onSiteVisitorDetailsRequired",
                        checked === true,
                      )
                    }
                  />
                  <Label htmlFor="onSiteVisitorDetailsRequired">
                    Datos del visitante obligatorios
                  </Label>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Notificaciones internas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="notifyOnSale"
                    checked={form.watch("notifyOnSale")}
                    onCheckedChange={(checked) =>
                      form.setValue("notifyOnSale", checked === true)
                    }
                  />
                  <Label htmlFor="notifyOnSale">Notificar ventas</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="notifyOnCancellation"
                    checked={form.watch("notifyOnCancellation")}
                    onCheckedChange={(checked) =>
                      form.setValue("notifyOnCancellation", checked === true)
                    }
                  />
                  <Label htmlFor="notifyOnCancellation">
                    Notificar cancelaciones
                  </Label>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notificationEmails">
                    Correos (uno por línea)
                  </Label>
                  <Textarea
                    id="notificationEmails"
                    rows={4}
                    placeholder="operaciones@ejemplo.com"
                    {...form.register("notificationEmails")}
                  />
                </div>
              </CardContent>
            </Card>

            <Button type="submit" disabled={pending !== null}>
              {pending === "save" ? "Guardando…" : "Guardar configuración"}
            </Button>
            {settingsId && !initialBundle?.settings.cancelledAt ? (
              <FastPassCancelFestivalDayForm settingsId={settingsId} />
            ) : null}
          </form>
        </Form>
      )}
    </div>
  );
}
