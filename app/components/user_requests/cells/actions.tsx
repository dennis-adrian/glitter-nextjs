import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  reviewBecomeArtistRequest,
  reviewFestivalParticipationRequest,
} from "@/api/user_requests/actions";
import { UserRequest } from "@/app/api/user_requests/definitions";
import { toast } from "sonner";

export function ActionsCell({ request }: { request: UserRequest }) {
  async function review(status: "accepted" | "rejected") {
    const result =
      request.type === "become_artist"
        ? await reviewBecomeArtistRequest({ requestId: request.id, status })
        : await reviewFestivalParticipationRequest({
            requestId: request.id,
            status,
          });
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
  }

  return (
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
        <DropdownMenuItem disabled={request.status !== "pending"} asChild>
          <form className="w-full" action={() => review("accepted")}>
            <button
              className="w-full text-left"
              type="submit"
              disabled={request.status !== "pending"}
            >
              Aprobar
            </button>
          </form>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={request.status !== "pending"} asChild>
          <form className="w-full" action={() => review("rejected")}>
            <button
              className="w-full text-left"
              type="submit"
              disabled={request.status !== "pending"}
            >
              Rechazar
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
