import { MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";

import { updateReservation } from "@/app/api/user_requests/actions";
import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/actions";

import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ActionsCell({
  reservation,
}: {
  reservation: ReservationWithParticipantsAndUsersAndStand;
}) {
  async function onApprove() {
    const res = await updateReservation(reservation.id, {
      ...reservation,
      status: "accepted",
    });
    if (res.success) {
      toast.success(res.message, {
        duration: 3000,
        action: {
          label: "Cerrar",
          onClick: () => {
            toast.dismiss();
          },
        },
      });
    } else {
      toast.error(res.message, {
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
    const res = await updateReservation(reservation.id, {
      ...reservation,
      status: "rejected",
    });
    if (res.success) {
      toast.warning(res.message, {
        duration: 3000,
        action: {
          label: "Cerrar",
          onClick: () => {
            toast.dismiss();
          },
        },
      });
    } else {
      toast.error(res.message, {
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
          <MoreHorizontalIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={reservation.status === "accepted"} asChild>
          <form className="w-full" action={onApprove}>
            <button className="w-full text-left" type="submit">
              Aprobar
            </button>
          </form>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={reservation.status === "rejected"} asChild>
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
