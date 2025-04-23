import ArrivalRegistrationForm from "@/app/components/organisms/collaborators/arrival-registration-form";
import ArrivalRemovalForm from "@/app/components/organisms/collaborators/arrival-removal-form";
import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { ReservationCollaborationWithRelations } from "@/app/lib/collaborators/definitions";
import { FileClockIcon, MoreHorizontalIcon } from "lucide-react";

export default function TableActions({
  reservationCollaboration,
}: {
  reservationCollaboration: ReservationCollaborationWithRelations;
}) {
  const festival = reservationCollaboration.reservation.festival;

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
        <DropdownMenuItem asChild>
          <ArrivalRegistrationForm
            reservationCollaboration={reservationCollaboration}
            festivalDate={festival.festivalDates[0]}
          >
            <FileClockIcon className="h-4 w-4 mr-1" />
            Registrar llegada día 1
          </ArrivalRegistrationForm>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <ArrivalRegistrationForm
            reservationCollaboration={reservationCollaboration}
            festivalDate={festival.festivalDates[1]}
          >
            <FileClockIcon className="h-4 w-4 mr-1" />
            Registrar llegada día 2
          </ArrivalRegistrationForm>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
