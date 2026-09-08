"use client";

import {
  CalendarClockIcon,
  FilePenLineIcon,
  MoreHorizontalIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react";

import { ReservationWithParticipantsAndUsersAndStandAndFestival } from "@/app/api/reservations/definitions";

import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import GuardedMenuItem from "@/app/components/payments/guarded-menu-item";
import { DeleteReservationModal } from "@/app/components/reservations/form/delete-modal";
import { useState } from "react";
import { RejectReservationModal } from "@/app/components/reservations/form/reject-modal";
import { ExtendDeadlineModal } from "@/app/components/reservations/form/extend-deadline-modal";

export function ActionsCell({
  reservation,
  canMutate = false,
}: {
  reservation: ReservationWithParticipantsAndUsersAndStandAndFestival;
  /**
   * Every action here is guarded server-side by `canMutateAdminReservations`,
   * which is global-admin-only. Without this the menu offered a festival admin
   * four controls that always failed.
   */
  canMutate?: boolean;
}) {
  const [openDeleteModal, setOpenDeleteModal] = useState(false);
  const [openRejectModal, setOpenRejectModal] = useState(false);
  const [openExtendModal, setOpenExtendModal] = useState(false);

  const canExtend = canMutate && reservation.status === "pending";
  const deniedReason = canMutate
    ? undefined
    : "Solo un administrador global puede hacerlo";

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontalIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/reservations/${reservation.id}/edit`}>
              <FilePenLineIcon className="h-4 w-4 mr-1" />
              Editar
            </Link>
          </DropdownMenuItem>
          <GuardedMenuItem
            disabledReason={
              deniedReason ??
              (reservation.status === "pending"
                ? undefined
                : "Solo se extienden reservas pendientes de pago")
            }
            onSelect={() => setOpenExtendModal(true)}
          >
            <CalendarClockIcon className="h-4 w-4 mr-1" />
            Extender plazo de pago
          </GuardedMenuItem>
          <GuardedMenuItem
            disabledReason={deniedReason}
            onSelect={() => setOpenRejectModal(true)}
          >
            <XCircleIcon className="h-4 w-4 mr-1" />
            Cancelar
          </GuardedMenuItem>
          <GuardedMenuItem
            disabledReason={deniedReason}
            destructive
            onSelect={() => setOpenDeleteModal(true)}
          >
            <Trash2Icon className="h-4 w-4 mr-1" />
            Eliminar
          </GuardedMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteReservationModal
        open={openDeleteModal}
        reservation={reservation}
        setOpen={setOpenDeleteModal}
      />
      <RejectReservationModal
        open={openRejectModal}
        reservation={reservation}
        setOpen={setOpenRejectModal}
      />
      {canExtend && (
        <ExtendDeadlineModal
          open={openExtendModal}
          reservation={reservation}
          setOpen={setOpenExtendModal}
        />
      )}
    </>
  );
}
