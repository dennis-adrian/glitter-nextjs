"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Label } from "@/app/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import { Textarea } from "@/app/components/ui/textarea";
import { updateStoreSettings } from "@/app/lib/store_settings/actions";
import {
  STORE_SECTION_LABELS,
  type StoreSettings,
  type StoreStatusMode,
} from "@/app/lib/store_settings/definitions";

const MODE_OPTIONS: {
  value: StoreStatusMode;
  label: string;
  description: string;
}[] = [
  {
    value: "auto",
    label: "Automático",
    description:
      "Comportamiento normal: la sección se cierra sola durante un festival en curso.",
  },
  {
    value: "open",
    label: "Forzar abierta",
    description:
      "La sección permanece abierta aunque haya un festival en curso.",
  },
  {
    value: "closed",
    label: "Forzar cerrada",
    description:
      "La sección se cierra ahora mismo y muestra el mensaje de abajo a los visitantes.",
  },
];

type Props = {
  settings: StoreSettings;
};

export default function StoreSectionSettingsCard({ settings }: Props) {
  const [mode, setMode] = useState<StoreStatusMode>(settings.mode);
  const [closedTitle, setClosedTitle] = useState(settings.closedTitle ?? "");
  const [closedMessage, setClosedMessage] = useState(
    settings.closedMessage ?? "",
  );
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      try {
        const result = await updateStoreSettings({
          section: settings.section,
          mode,
          closedTitle,
          closedMessage,
        });
        if (result.success) {
          toast.success(result.message);
        } else {
          toast.error(result.message);
        }
      } catch {
        toast.error("No se pudo guardar la configuración");
      }
    });
  }

  const sectionLabel = STORE_SECTION_LABELS[settings.section];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{sectionLabel}</CardTitle>
        <CardDescription>
          Controla manualmente si la sección de {sectionLabel.toLowerCase()} está
          abierta o cerrada para los visitantes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup
          value={mode}
          onValueChange={(value) => setMode(value as StoreStatusMode)}
          className="gap-3"
        >
          {MODE_OPTIONS.map((option) => (
            <Label
              key={option.value}
              htmlFor={`${settings.section}-mode-${option.value}`}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3 has-data-[state=checked]:border-primary"
            >
              <RadioGroupItem
                id={`${settings.section}-mode-${option.value}`}
                value={option.value}
                className="mt-0.5"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium">
                  {option.label}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </Label>
          ))}
        </RadioGroup>

        {mode === "closed" && (
          <div className="space-y-4 rounded-lg border border-border/70 p-4">
            <div className="space-y-2">
              <Label htmlFor={`${settings.section}-closed-title`}>
                Título del mensaje
              </Label>
              <Textarea
                id={`${settings.section}-closed-title`}
                value={closedTitle}
                onChange={(event) => setClosedTitle(event.target.value)}
                placeholder="La tiendita está cerrada"
                rows={1}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${settings.section}-closed-message`}>
                Mensaje
              </Label>
              <Textarea
                id={`${settings.section}-closed-message`}
                value={closedMessage}
                onChange={(event) => setClosedMessage(event.target.value)}
                placeholder="Estamos haciendo una pausa por el momento. ¡Vuelve pronto!"
                rows={4}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Si dejas estos campos vacíos se mostrará un mensaje por defecto.
            </p>
          </div>
        )}

        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar cambios"}
        </Button>
      </CardContent>
    </Card>
  );
}
