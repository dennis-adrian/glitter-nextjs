import {
  BanIcon,
  CheckCheckIcon,
  CheckIcon,
  CircleCheckBigIcon,
  CircleCheckIcon,
  MoreHorizontal,
  TagsIcon,
  Trash2Icon,
  UserIcon,
  XCircleIcon,
} from "lucide-react";

import { ProfileType } from "@/app/api/users/definitions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { useState } from "react";
import { DeleteProfileModal } from "@/app/components/users/form/delete-profile-modal";
import { VerifyProfileModal } from "@/app/components/users/form/verify-user-modal";
import { DisableProfileModal } from "@/app/components/users/form/disable-profile-modal";
import { RejectProfileModal } from "@/app/components/users/form/reject-profile-modal";

export function ActionsCell({ user }: { user: ProfileType }) {
  const [openDeleteModal, setOpenDeleteModal] = useState(false);
  const [openVerifyModal, setOpenVerifyModal] = useState(false);
  const [openDisableModal, setOpenDisableModal] = useState(false);
  const [openRejectModal, setOpenRejectModal] = useState(false);
  const allowVerify = user.status !== "verified";

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
        <DropdownMenuItem
          disabled={!allowVerify}
          onClick={() => setOpenVerifyModal(true)}
        >
          {allowVerify ? (
            <span className="flex items-center gap-1">
              <CircleCheckIcon className="h-4 w-4" />
              {user.status === "banned" ? "Habilitar" : "Verificar"}
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <CircleCheckBigIcon className="h-4 w-4" />
              Verificado
            </span>
          )}
        </DropdownMenuItem>
        {user.status !== "verified" && user.status !== "banned" ? (
          <DropdownMenuItem
            disabled={user.status === "rejected"}
            onClick={() => setOpenRejectModal(true)}
          >
            <XCircleIcon className="h-4 w-4 mr-1" />
            {user.status === "pending" ? "Rechazar" : "Rechazado"}
          </DropdownMenuItem>
        ) : null}
        {user.status !== "pending" && user.status !== "rejected" && (
          <DropdownMenuItem
            disabled={user.status === "banned"}
            onClick={() => setOpenDisableModal(true)}
          >
            {user.status === "banned" ? (
              <span className="flex items-center gap-1">
                <BanIcon className="h-4 w-4" />
                Deshabilitado
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <BanIcon className="h-4 w-4" />
                Deshabilitar
              </span>
            )}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/users/${user.id}`}>
            <UserIcon className="h-4 w-4 mr-1" />
            Ver perfil
          </Link>
        </DropdownMenuItem>
        {user.userRequests.length > 0 && (
          <DropdownMenuItem>
            <Link
              className="flex items-center gap-1"
              href={`/dashboard/users/${user.id}/requests`}
            >
              <TagsIcon className="h-4 w-4" />
              Ver solicitudes
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="text-destructive hover:text-destructive-foreground hover:bg-destructive"
          onClick={() => setOpenDeleteModal(true)}
        >
          <Trash2Icon className="h-4 w-4 mr-1" />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
      <DeleteProfileModal
        open={openDeleteModal}
        profile={user}
        setOpen={setOpenDeleteModal}
      />
      <VerifyProfileModal
        open={openVerifyModal}
        profile={user}
        setOpen={setOpenVerifyModal}
      />
      <DisableProfileModal
        open={openDisableModal}
        profile={user}
        setOpen={setOpenDisableModal}
      />
      <RejectProfileModal
        open={openRejectModal}
        profile={user}
        setOpen={setOpenRejectModal}
      />
    </DropdownMenu>
  );
}
