"use client";

import {
  CreditCardIcon,
  FilePenLineIcon,
  MoreHorizontalIcon,
  Trash2Icon,
} from "lucide-react";

import { ReservationWithParticipantsAndUsersAndStandAndFestival } from "@/app/api/reservations/definitions";

import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { DeleteReservationModal } from "@/app/components/reservations/form/delete-modal";
import { useState } from "react";

export function ActionsCell({
  reservation,
}: {
  reservation: ReservationWithParticipantsAndUsersAndStandAndFestival;
}) {
  const [openDeleteModal, setOpenDeleteModal] = useState(false);

  return (
    <>
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
          {/* <DropdownMenuItem asChild>
            <Link href={`/dashboard/reservations/${reservation.id}/payments`}>
              <CreditCardIcon className="h-4 w-4 mr-1" />
              Ver pagos
            </Link>
          </DropdownMenuItem> */}
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/reservations/${reservation.id}/edit`}>
              <FilePenLineIcon className="h-4 w-4 mr-1" />
              Editar
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpenDeleteModal(true)}>
            <Trash2Icon className="h-4 w-4 mr-1" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteReservationModal
        open={openDeleteModal}
        reservation={reservation}
        setOpen={setOpenDeleteModal}
      />
    </>
  );
}
