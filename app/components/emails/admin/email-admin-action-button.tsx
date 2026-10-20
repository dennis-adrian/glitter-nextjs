"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { Button } from "@/app/components/ui/button";
import type { EmailAdminActionResult } from "@/app/lib/emails/admin-definitions";

/**
 * A row's one action, behind a confirmation that says what will happen. The
 * dialog stays open until the server answers, so a slow call cannot be
 * clicked twice or look done before it is.
 */
export default function EmailAdminActionButton({
  label,
  ariaLabel,
  pendingLabel,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  destructive = false,
  run,
}: {
  label: string;
  /** The button's name for screen readers: which row it acts on. */
  ariaLabel: string;
  pendingLabel: string;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  run: () => Promise<EmailAdminActionResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      try {
        const result = await run();
        if (!result.success) {
          toast.error(result.message);
          // Usually the row changed elsewhere (another admin, Resend): show
          // the list as it is now rather than a button that keeps failing.
          setOpen(false);
          router.refresh();
          return;
        }
        if (result.warning) {
          toast.warning(result.message, { duration: 15_000 });
        } else {
          toast.success(result.message);
        }
        setOpen(false);
        router.refresh();
      } catch {
        toast.error("No se pudo completar. Intenta de nuevo.");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full sm:w-auto"
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">{title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">{description}</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {cancelLabel}
            </AlertDialogCancel>
            <AlertDialogAction
              className={
                destructive
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              onClick={(event) => {
                // Radix closes on click; keep it up until the action answers.
                event.preventDefault();
                confirm();
              }}
              disabled={pending}
            >
              {pending ? pendingLabel : confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
