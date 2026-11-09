"use client";

import { Loader2Icon, MoreHorizontalIcon, SendIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import GuardedMenuItem from "@/app/components/payments/guarded-menu-item";
import { Button } from "@/app/components/ui/button";
import { resendTicketEmail } from "@/app/lib/tickets/resend-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toastActionError } from "@/app/lib/errors/action-error";

const FAILURE_MESSAGE =
  "No pudimos reenviar la entrada. Intentá de nuevo en unos minutos.";

/**
 * Staff actions on one ticket. The resend stays listed with its reason when
 * it cannot run, instead of disappearing from the menu.
 */
export default function TicketRowActions({
  ticketId,
  resendDisabledReason,
}: {
  ticketId: number;
  /** Why staff cannot resend this ticket; undefined when they can. */
  resendDisabledReason?: string;
}) {
  const [sending, setSending] = useState(false);

  async function resend() {
    setSending(true);
    let res;
    try {
      res = await resendTicketEmail(ticketId);
    } catch (error) {
      console.error("Error resending ticket email", error);
      toastActionError(error, FAILURE_MESSAGE);
      return;
    } finally {
      setSending(false);
    }

    if (res.success) {
      toast.success("Entrada reenviada", { description: res.message });
    } else {
      toast.error(res.message);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Acciones</span>
          {sending ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontalIcon className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Entrada</DropdownMenuLabel>
        <GuardedMenuItem
          disabledReason={
            sending ? "Enviando la entrada…" : resendDisabledReason
          }
          onSelect={() => void resend()}
        >
          <SendIcon className="mr-1 h-4 w-4" />
          Reenviar entrada por correo
        </GuardedMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
