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
import { updateUserRequest } from "@/api/user_requests/actions";
import { UserRequest } from "@/app/api/user_requests/definitions";
import { toast } from "sonner";

export function ActionsCell({ request }: { request: UserRequest }) {
  async function onApprove() {
    const res = await updateUserRequest(request.id, {
      ...request,
      status: "accepted",
    });
    if (res.success) {
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
      toast.error("Error al aprobar la solicitud.", {
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

  async function onReject() {
    const res = await updateUserRequest(request.id, {
      ...request,
      status: "rejected",
    });
    if (res.success) {
      toast.warning("La solicitud ha sido rechazada.", {
        duration: 3000,
        action: {
          label: "Cerrar",
          onClick: () => {
            toast.dismiss();
          },
        },
      });
    } else {
      toast.error("Error al rechazar la solicitud.", {
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
        <DropdownMenuItem disabled={request.status === "accepted"} asChild>
          <form className="w-full" action={onApprove}>
            <button className="w-full text-left" type="submit">
              Aprobar
            </button>
          </form>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={request.status === "rejected"} asChild>
          <form className="w-full" action={onReject}>
            <button className="w-full text-left" type="submit">
              Rechazar
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
