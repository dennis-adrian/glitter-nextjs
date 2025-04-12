import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Button } from "@/app/components/ui/button";
import { ReservationCollaborationWithRelations } from "@/app/lib/collaborators/definitions";
import { MoreHorizontalIcon } from "lucide-react";
import ArrivalRegistrationForm from "@/app/components/organisms/collaborators/arrival-registration-form";

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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
