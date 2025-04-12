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
import { MoreHorizontalIcon } from "lucide-react";

export default function TableActions({
  reservationCollaboration,
}: {
  reservationCollaboration: ReservationCollaborationWithRelations;
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
        <DropdownMenuItem asChild>
          <ArrivalRegistrationForm
            reservationCollaboration={reservationCollaboration}
          />
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <ArrivalRemovalForm
            reservationCollaboration={reservationCollaboration}
          />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
