"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import { toastActionError } from "@/app/lib/errors/action-error";
import { updateVolunteerApplicationNotes } from "@/app/lib/volunteers/admin-actions";
import { VOLUNTEER_ADMIN_COPY } from "@/app/lib/volunteers/admin-definitions";
import { VOLUNTEER_ADMIN_NOTES_MAX_LENGTH } from "@/app/lib/volunteers/admin-schema";

/** The team's private notes about the application. */
export default function VolunteerApplicationNotesForm({
  festivalId,
  applicationId,
  adminNotes,
}: {
  festivalId: number;
  applicationId: number;
  adminNotes: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState(adminNotes ?? "");
  const unchanged = notes.trim() === (adminNotes ?? "").trim();

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        const result = await updateVolunteerApplicationNotes({
          festivalId,
          applicationId,
          adminNotes: notes,
        });
        if (result.success) {
          toast.success(result.message);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        toastActionError(error, VOLUNTEER_ADMIN_COPY.genericError);
      }
    });
  }

  return (
    <form onSubmit={save} className="flex min-w-0 flex-col gap-2">
      <Label htmlFor="volunteer-admin-notes">Notas internas</Label>
      <Textarea
        id="volunteer-admin-notes"
        value={notes}
        maxLength={VOLUNTEER_ADMIN_NOTES_MAX_LENGTH}
        rows={5}
        aria-describedby="volunteer-admin-notes-hint"
        onChange={(event) => setNotes(event.target.value)}
        className="text-sm"
      />
      <div
        id="volunteer-admin-notes-hint"
        className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground"
      >
        <span>{VOLUNTEER_ADMIN_COPY.notesHint}</span>
        <span className="tabular-nums">
          {notes.length}/{VOLUNTEER_ADMIN_NOTES_MAX_LENGTH}
        </span>
      </div>
      <Button
        type="submit"
        size="sm"
        className="self-start"
        disabled={isPending || unchanged}
      >
        {isPending ? "Guardando..." : "Guardar notas"}
      </Button>
    </form>
  );
}
