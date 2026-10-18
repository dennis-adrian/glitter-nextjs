"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { UserRequest } from "@/app/api/user_requests/definitions";
import TextareaInput from "@/app/components/form/fields/textarea";
import SubmitButton from "@/app/components/simple-submit-button";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Form } from "@/app/components/ui/form";
import { getUserName } from "@/app/lib/users/utils";

const FormSchema = z.object({
  reason: z.string().max(1000),
});

type FormValues = z.infer<typeof FormSchema>;

export default function RejectRequestDialog({
  request,
  open,
  onOpenChange,
  onConfirm,
}: {
  request: UserRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resolves true when the rejection went through, so the dialog can close. */
  onConfirm: (reason: string | undefined) => Promise<boolean>;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { reason: "" },
  });
  const isSubmitting = form.formState.isSubmitting;
  const isFestivalParticipation = request.type === "festival_participation";
  const name = getUserName(request.user) || request.user.email;

  function handleOpenChange(next: boolean) {
    if (isSubmitting) return;
    // A reason typed for one request must never ride along on the next.
    if (!next) form.reset();
    onOpenChange(next);
  }

  const action: () => void = form.handleSubmit(async (data) => {
    const ok = await onConfirm(data.reason.trim() || undefined);
    if (ok) {
      form.reset();
      onOpenChange(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rechazar solicitud</DialogTitle>
          <DialogDescription>
            {isFestivalParticipation ? (
              <>
                ¿Rechazar la solicitud de <strong>{name}</strong> para
                participar en <strong>{request.festival?.name}</strong>? Le
                vamos a avisar por correo.
              </>
            ) : (
              <>
                ¿Rechazar la solicitud de <strong>{name}</strong> para ser
                artista?
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={action} className="flex flex-col gap-4">
            {isFestivalParticipation && (
              <TextareaInput
                formControl={form.control}
                name="reason"
                label="Motivo (opcional)"
                placeholder="Ej: El cupo del sector de ilustración ya está completo."
                maxLength={1000}
                description="Lo va a ver el participante en el correo."
              />
            )}
            <DialogFooter>
              <SubmitButton
                variant="destructive"
                disabled={isSubmitting}
                loading={isSubmitting}
                loadingLabel="Rechazando..."
                label="Rechazar solicitud"
              />
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isSubmitting}>
                  Cancelar
                </Button>
              </DialogClose>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
