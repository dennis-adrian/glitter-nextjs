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
import { MoreHorizontalIcon } from "lucide-react";

export function ActionsCell({
  reservation,
}: {
  reservation: ReservationWithParticipantsAndUsersAndStand;
}) {
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
          <form className="w-full" action={() => {}}>
            <button className="w-full text-left" type="submit">
              Aprobar
            </button>
          </form>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={reservation.status === "rejected"} asChild>
          <form className="w-full" action={() => {}}>
            <button className="w-full text-left" type="submit">
              Rechazar
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
