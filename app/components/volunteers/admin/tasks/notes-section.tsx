"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Textarea } from "@/app/components/ui/textarea";
import { addVolunteerNote } from "@/app/lib/volunteers/admin-actions";
import type { VolunteerNote } from "@/app/lib/volunteers/admin-task-queries";
import {
  formatShortDate,
  VOLUNTEER_NOTE_MAX_LENGTH,
} from "@/app/lib/volunteers/admin-tasks";

/** The notes, oldest first, as "[admin], 22 nov: [nota]". */
export function NotesList({
  notes,
  legacyNote,
}: {
  notes: VolunteerNote[];
  /** volunteer_applications.admin_notes, from before notes were signed. */
  legacyNote: string | null;
}) {
  if (notes.length === 0 && !legacyNote) {
    return <p className="text-muted-foreground">Todavía no hay notas.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {legacyNote && (
        <li className="break-words whitespace-pre-line">{legacyNote}</li>
      )}
      {notes.map((note) => (
        <li key={note.id} className="break-words whitespace-pre-line">
          <span className="text-muted-foreground">
            {note.authorName ? `${note.authorName}, ` : ""}
            {formatShortDate(note.createdAt)}:
          </span>{" "}
          {note.body}
        </li>
      ))}
    </ul>
  );
}

/**
 * "Agregar una nota". Controlled, so a decision can save what is typed;
 * "Guardar nota" saves it on its own.
 */
export function NoteComposer({
  festivalId,
  applicationId,
  value,
  onChange,
  id,
}: {
  festivalId: number;
  applicationId: number;
  value: string;
  onChange: (value: string) => void;
  id: string;
}) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();

  const save = () =>
    startSaving(async () => {
      const result = await addVolunteerNote({
        festivalId,
        applicationId,
        body: value,
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      onChange("");
      toast.success(result.message);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="sr-only">
        Agregar una nota
      </label>
      <Textarea
        id={id}
        rows={3}
        placeholder="Agregar una nota"
        maxLength={VOLUNTEER_NOTE_MAX_LENGTH}
        value={value}
        // Read-only while saving, so nothing typed meanwhile is cleared.
        readOnly={isSaving}
        aria-busy={isSaving}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-160"
      />
      {value.trim() && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={isSaving}
          onClick={save}
        >
          Guardar nota
        </Button>
      )}
    </div>
  );
}
