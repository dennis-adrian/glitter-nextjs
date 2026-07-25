"use client";

import FileInput from "@/app/components/form/fields/file";
import SubmitButton from "@/app/components/simple-submit-button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import {
  addInfractionEvidence,
  addInfractionNote,
} from "@/app/lib/infractions/actions";
import { participantDisplayName } from "@/app/lib/infractions/mappers";
import { formatDate } from "@/app/lib/formatters";
import type { InfractionDetail } from "@/app/lib/infractions/queries";
import { zodResolver } from "@hookform/resolvers/zod";
import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const noteSchema = z.object({
  content: z.string().trim().min(1, "La nota es obligatoria").max(5000),
});

const evidenceSchema = z.object({
  url: z.url("Subí un archivo de evidencia"),
  label: z.string().trim().max(200).optional(),
});

export function InfractionNotesPanel({
  infraction,
}: {
  infraction: InfractionDetail;
}) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(noteSchema),
    defaultValues: { content: "" },
  });

  const onSubmit = form.handleSubmit(async (data) => {
    const response = await addInfractionNote({
      infractionId: infraction.id,
      content: data.content,
    });
    if (!response.success) {
      toast.error(response.message);
      return;
    }
    toast.success(response.message);
    form.reset();
    router.refresh();
  });

  return (
    <div className="space-y-4 rounded-md border p-4">
      <h3 className="font-medium text-sm">Notas internas</h3>
      <p className="text-xs text-muted-foreground">
        Solo visibles para administradores.
      </p>
      <ul className="space-y-3">
        {infraction.notes.length === 0 ? (
          <li className="text-sm text-muted-foreground">Sin notas</li>
        ) : (
          infraction.notes.map((note) => (
            <li key={note.id} className="rounded-md bg-muted/40 p-3 text-sm">
              <p>{note.content}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {participantDisplayName(note.author)} ·{" "}
                {formatDate(note.createdAt).toLocaleString(
                  DateTime.DATETIME_MED,
                )}
              </p>
            </li>
          ))
        )}
      </ul>
      <Form {...form}>
        <form className="space-y-3" onSubmit={onSubmit}>
          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nueva nota</FormLabel>
                <FormControl>
                  <Textarea {...field} maxLength={5000} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <SubmitButton
            disabled={form.formState.isSubmitting}
            loading={form.formState.isSubmitting}
            label="Agregar nota"
          />
        </form>
      </Form>
    </div>
  );
}

export function InfractionEvidencePanel({
  infraction,
}: {
  infraction: InfractionDetail;
}) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(evidenceSchema),
    defaultValues: { url: "", label: "" },
  });
  const evidenceUrl = useWatch({ control: form.control, name: "url" });

  const onSubmit = form.handleSubmit(async (data) => {
    const response = await addInfractionEvidence({
      infractionId: infraction.id,
      url: data.url,
      label: data.label,
      mimeType: "image/*",
    });
    if (!response.success) {
      toast.error(response.message);
      return;
    }
    toast.success(response.message);
    form.reset();
    router.refresh();
  });

  return (
    <div className="space-y-4 rounded-md border p-4">
      <h3 className="font-medium text-sm">Evidencia</h3>
      <ul className="space-y-3">
        {infraction.evidence.length === 0 ? (
          <li className="text-sm text-muted-foreground">Sin evidencia</li>
        ) : (
          infraction.evidence.map((item) => (
            <li key={item.id} className="text-sm">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {item.label || "Ver evidencia"}
              </a>
              <p className="text-xs text-muted-foreground">
                {participantDisplayName(item.addedBy)} ·{" "}
                {formatDate(item.createdAt).toLocaleString(
                  DateTime.DATETIME_MED,
                )}
              </p>
            </li>
          ))
        )}
      </ul>
      <Form {...form}>
        <form className="space-y-3" onSubmit={onSubmit}>
          <FileInput
            formControl={form.control}
            label="Archivo"
            name="url"
            endpoint="imageUploader"
          />
          <FormField
            control={form.control}
            name="label"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Etiqueta (opcional)</FormLabel>
                <FormControl>
                  <Input {...field} maxLength={200} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <SubmitButton
            disabled={form.formState.isSubmitting || !evidenceUrl}
            loading={form.formState.isSubmitting}
            label="Agregar evidencia"
          />
        </form>
      </Form>
    </div>
  );
}

export function InfractionEventsPanel({
  events,
}: {
  events: InfractionDetail["events"];
}) {
  return (
    <div className="space-y-3 rounded-md border p-4">
      <h3 className="font-medium text-sm">Historial de auditoría</h3>
      <ul className="space-y-2">
        {events.length === 0 ? (
          <li className="text-sm text-muted-foreground">Sin eventos</li>
        ) : (
          events.map((event) => (
            <li key={event.id} className="text-sm border-b last:border-0 pb-2">
              <p className="font-medium">{event.eventType}</p>
              <p className="text-xs text-muted-foreground">
                {event.actor
                  ? participantDisplayName(event.actor)
                  : "Sistema o dato migrado"}
              </p>
              {(event.fromStatus || event.toStatus) && (
                <p className="text-xs text-muted-foreground">
                  {event.fromStatus ?? "—"} → {event.toStatus ?? "—"}
                </p>
              )}
              {event.note && <p className="text-xs mt-1">{event.note}</p>}
              {formatEventChanges(event.changes).map((change) => (
                <p key={change} className="text-xs mt-1">
                  {change}
                </p>
              ))}
              <p className="text-xs text-muted-foreground mt-1">
                {formatDate(event.createdAt).toLocaleString(
                  DateTime.DATETIME_MED,
                )}
              </p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

const changeFieldLabels: Record<string, string> = {
  userId: "Participante",
  typeId: "Tipo",
  festivalId: "Festival",
  description: "Descripción",
  userGaveNotice: "Aviso previo",
  gaveNoticeAt: "Fecha de aviso",
  duplicateIds: "Posibles duplicados",
};

function formatEventChanges(changes: unknown): string[] {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    return [];
  }

  return Object.entries(changes).map(([field, value]) => {
    const label = changeFieldLabels[field] ?? field;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const transition = value as { from?: unknown; to?: unknown };
      if ("from" in transition || "to" in transition) {
        return `${label}: ${formatChangeValue(transition.from)} → ${formatChangeValue(transition.to)}`;
      }
    }
    return `${label}: ${formatChangeValue(value)}`;
  });
}

function formatChangeValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) return value.map(formatChangeValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
