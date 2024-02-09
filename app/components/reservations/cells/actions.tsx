"use client";

import {
  BanIcon,
  CheckCircleIcon,
  FilePenLineIcon,
  MoreHorizontalIcon,
  Trash2Icon,
} from "lucide-react";
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
import Link from "next/link";
import { DeleteReservationModal } from "@/app/components/reservations/form/delete-modal";
import { useState } from "react";

export function ActionsCell({
  reservation,
}: {
  reservation: ReservationWithParticipantsAndUsersAndStand;
}) {
  const [openDeleteModal, setOpenDeleteModal] = useState(false);

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
          <DropdownMenuItem
            disabled={reservation.status === "accepted"}
            asChild
          >
            <form className="w-full" action={onApprove}>
              <Button
                className="flex justify-start h-5 font-normal hover:font-normal w-full text-left p-0"
                type="submit"
                variant="ghost"
                size="sm"
              >
                <CheckCircleIcon className="h-4 w-4 mr-1" />
                Aprobar
              </Button>
            </form>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={reservation.status === "rejected"}
            asChild
          >
            <form className="w-full" action={onReject}>
              <Button
                className="flex justify-start h-5 font-normal hover:font-normal w-full text-left p-0"
                type="submit"
                variant="ghost"
                size="sm"
              >
                <BanIcon className="h-4 w-4 mr-1" />
                Rechazar
              </Button>
            </form>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
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
