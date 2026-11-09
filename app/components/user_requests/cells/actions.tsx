"use client";

import { MoreHorizontal } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  reviewBecomeArtistRequest,
  reviewFestivalParticipationRequest,
} from "@/app/api/user_requests/actions";
import { UserRequest } from "@/app/api/user_requests/definitions";
import GuardedMenuItem from "@/app/components/payments/guarded-menu-item";
import RejectRequestDialog from "@/app/components/user_requests/reject-request-dialog";
import { toast } from "sonner";
import { toastActionError } from "@/app/lib/errors/action-error";

export function ActionsCell({ request }: { request: UserRequest }) {
  const [openReject, setOpenReject] = useState(false);

  async function review(
    status: "accepted" | "rejected",
    reason?: string,
  ): Promise<boolean> {
    let result: { success: boolean; message: string };
    try {
      result =
        request.type === "become_artist"
          ? await reviewBecomeArtistRequest({ requestId: request.id, status })
          : await reviewFestivalParticipationRequest({
              requestId: request.id,
              status,
              ...(reason ? { reason } : {}),
            });
    } catch (error) {
      // A thrown action (network, server crash) resolves false like a refused
      // one, so the reject dialog stays open with the typed reason.
      console.error("Error reviewing the request", error);
      toastActionError(
        error,
        "No pudimos guardar la revisión. Intentá de nuevo en unos minutos.",
      );
      return false;
    }
    if (result.success) {
      if (status === "accepted") {
        toast.success("La solicitud ha sido aprobada.", {
          duration: 3000,
          action: {
            label: "Cerrar",
            onClick: () => {
              toast.dismiss();
            },
          },
        });
      } else {
        toast.warning("La solicitud ha sido rechazada.", {
          duration: 3000,
          action: {
            label: "Cerrar",
            onClick: () => {
              toast.dismiss();
            },
          },
        });
      }
    } else {
      toast.error(result.message ?? "Error al actualizar la solicitud.", {
        duration: 3000,
        action: {
          label: "Cerrar",
          onClick: () => {
            toast.dismiss();
          },
        },
      });
    }
    return result.success;
  }

  const reviewed =
    request.status !== "pending" ? "La solicitud ya fue revisada." : undefined;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <GuardedMenuItem
            disabledReason={reviewed}
            onSelect={() => void review("accepted")}
          >
            Aprobar
          </GuardedMenuItem>
          <GuardedMenuItem
            disabledReason={reviewed}
            destructive
            onSelect={() => setOpenReject(true)}
          >
            Rechazar
          </GuardedMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RejectRequestDialog
        request={request}
        open={openReject}
        onOpenChange={setOpenReject}
        onConfirm={(reason) => review("rejected", reason)}
      />
    </>
  );
}
