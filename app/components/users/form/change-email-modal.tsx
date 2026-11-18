"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { ProfileType } from "@/app/api/users/definitions";
import TextInput from "@/app/components/form/fields/text";
import SubmitButton from "@/app/components/simple-submit-button";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { Button } from "@/app/components/ui/button";
import {
  DrawerDialog,
  DrawerDialogClose,
  DrawerDialogContent,
  DrawerDialogDescription,
  DrawerDialogFooter,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import { Form } from "@/app/components/ui/form";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { toastActionError } from "@/app/lib/errors/action-error";
import { changeUserEmail } from "@/app/lib/users/email-change-actions";
import { ChangeUserEmailFormSchema } from "@/app/lib/users/email-change-definitions";

// A phone keyboard would otherwise capitalise or "correct" the address, and
// nothing downstream verifies what was typed.
const EMAIL_INPUT_PROPS = {
  type: "email",
  inputMode: "email",
  autoComplete: "off",
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: false,
  placeholder: "ejemplo@mail.com",
} as const;

/**
 * Moves an account to another address on the team's word alone: no
 * confirmation mail goes out first, which is why the address is typed twice.
 */
export function ChangeEmailModal({
  open,
  profile,
  setOpen,
}: {
  open: boolean;
  profile: ProfileType;
  setOpen: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  // Lives here and not in the form: the shell is what refuses to close.
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <DrawerDialog
      isDesktop={isDesktop}
      open={open}
      // The action makes several calls to Clerk; closing halfway would hide
      // how it ended.
      dismissible={!isSubmitting}
      onOpenChange={(next) => {
        if (isSubmitting) return;
        setOpen(next);
      }}
    >
      <DrawerDialogContent isDesktop={isDesktop} className="sm:max-w-md">
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Cambiar correo
          </DrawerDialogTitle>
          <DrawerDialogDescription isDesktop={isDesktop}>
            El correo con el que esta persona inicia sesión.
          </DrawerDialogDescription>
        </DrawerDialogHeader>

        <div className="max-h-[70vh] min-w-0 space-y-4 overflow-y-auto px-4 pb-2 md:px-0 md:pb-0">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Correo actual</p>
            <p className="wrap-anywhere font-medium">{profile.email}</p>
          </div>

          <Alert>
            <AlertCircleIcon className="h-4 w-4" />
            <AlertDescription className="min-w-0 space-y-2 break-words">
              <p>
                Desde ahora va a iniciar sesión con el correo nuevo. El actual
                deja de funcionar. Las sesiones que ya tiene abiertas siguen
                abiertas.
              </p>
              <p>
                Si tiene una cuenta de Google vinculada al correo actual, se
                desvincula. Puede seguir entrando con Google usando la cuenta de
                Google del correo nuevo.
              </p>
              <p>
                Nadie verifica el correo nuevo: si tiene un error, la persona
                queda sin acceso a su cuenta.
              </p>
            </AlertDescription>
          </Alert>

          {/* Content unmounts when the dialog closes, so a half-typed address
              goes with it; the key covers another profile behind this one. */}
          <ChangeEmailForm
            key={profile.id}
            profileId={profile.id}
            onSubmittingChange={setIsSubmitting}
            onSuccess={() => setOpen(false)}
          />
        </div>
        {isDesktop ? null : (
          <DrawerDialogFooter isDesktop={isDesktop} className="pt-2">
            <DrawerDialogClose isDesktop={isDesktop}>
              <Button
                variant="outline"
                className="w-full"
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
            </DrawerDialogClose>
          </DrawerDialogFooter>
        )}
      </DrawerDialogContent>
    </DrawerDialog>
  );
}

function ChangeEmailForm({
  profileId,
  onSubmittingChange,
  onSuccess,
}: {
  profileId: number;
  onSubmittingChange: (submitting: boolean) => void;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(ChangeUserEmailFormSchema),
    defaultValues: { email: "", confirmEmail: "" },
  });
  const isSubmitting = form.formState.isSubmitting;

  const action = form.handleSubmit(async (data) => {
    // Set here and not from an effect on `isSubmitting`: the guard has to be
    // up before the request leaves.
    onSubmittingChange(true);
    try {
      const result = await changeUserEmail({
        userId: profileId,
        email: data.email,
      });
      if (!result.success) {
        form.setError("email", {
          message: [result.message, result.description]
            .filter(Boolean)
            .join(" "),
        });
        return;
      }
      if (result.needsFollowUp) {
        // Something is left for the admin to do: it stays until dismissed.
        toast.warning(result.message, {
          description: result.description,
          duration: Infinity,
          closeButton: true,
        });
      } else {
        toast.success(
          result.message,
          result.description ? { description: result.description } : undefined,
        );
      }
      onSuccess();
      router.refresh();
    } catch (error) {
      // Not logged: the error can carry the request, and with it the address.
      // A thrown call has an unknown outcome, so the copy sends the admin to
      // check before trying again.
      toastActionError(
        error,
        "No se pudo confirmar el cambio de correo. Recargá la página y revisá el correo del usuario antes de intentar de nuevo.",
      );
    } finally {
      onSubmittingChange(false);
    }
  });

  return (
    <Form {...form}>
      {/* noValidate: the schema's messages, not the browser's bubbles. */}
      <form onSubmit={action} className="grid gap-4" noValidate>
        <TextInput
          name="email"
          label="Correo nuevo"
          description="Si repetís el correo actual, la cuenta de acceso se vuelve a sincronizar con él."
          disabled={isSubmitting}
          {...EMAIL_INPUT_PROPS}
        />
        <TextInput
          name="confirmEmail"
          label="Repetí el correo nuevo"
          disabled={isSubmitting}
          {...EMAIL_INPUT_PROPS}
        />
        <SubmitButton
          disabled={isSubmitting}
          label="Cambiar correo"
          submittingLabel="Cambiando correo..."
          wrap
        />
      </form>
    </Form>
  );
}
