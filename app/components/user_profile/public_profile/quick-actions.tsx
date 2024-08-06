"use client";

import {
  BanIcon,
  CircleCheckBigIcon,
  CircleCheckIcon,
  PenBoxIcon,
  TagsIcon,
  Trash2Icon,
  UserIcon,
  XCircleIcon,
} from "lucide-react";

import { ProfileType } from "@/app/api/users/definitions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { useState } from "react";
import { DeleteProfileModal } from "@/app/components/users/form/delete-profile-modal";
import { VerifyProfileModal } from "@/app/components/users/form/verify-user-modal";
import { DisableProfileModal } from "@/app/components/users/form/disable-profile-modal";
import { RejectProfileModal } from "@/app/components/users/form/reject-profile-modal";

export default function ProfileQuickActions({
  profile,
  hideViewProfile,
  children,
}: {
  hideViewProfile?: boolean;
  profile: ProfileType;
  children: React.ReactNode;
}) {
  const [openDeleteModal, setOpenDeleteModal] = useState(false);
  const [openVerifyModal, setOpenVerifyModal] = useState(false);
  const [openDisableModal, setOpenDisableModal] = useState(false);
  const [openRejectModal, setOpenRejectModal] = useState(false);
  const allowVerify = profile.status !== "verified";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
        {!hideViewProfile && (
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/users/${profile.id}`}>
              <UserIcon className="h-4 w-4 mr-1" />
              Ver perfil
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/users/${profile.id}/edit-categories`}>
            <PenBoxIcon className="h-4 w-4 mr-1" />
            Editar categorías
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!allowVerify}
          onClick={() => setOpenVerifyModal(true)}
        >
          {allowVerify ? (
            <span className="flex items-center gap-1">
              <CircleCheckIcon className="h-4 w-4" />
              {profile.status === "banned" ? "Habilitar" : "Verificar"}
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <CircleCheckBigIcon className="h-4 w-4" />
              Verificado
            </span>
          )}
        </DropdownMenuItem>
        {profile.status !== "verified" && profile.status !== "banned" ? (
          <DropdownMenuItem
            disabled={profile.status === "rejected"}
            onClick={() => setOpenRejectModal(true)}
          >
            <XCircleIcon className="h-4 w-4 mr-1" />
            {profile.status === "pending" ? "Rechazar" : "Rechazado"}
          </DropdownMenuItem>
        ) : null}
        {profile.status !== "pending" && profile.status !== "rejected" && (
          <DropdownMenuItem
            disabled={profile.status === "banned"}
            onClick={() => setOpenDisableModal(true)}
          >
            {profile.status === "banned" ? (
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
        {profile.userRequests.length > 0 && (
          <DropdownMenuItem>
            <Link
              className="flex items-center gap-1"
              href={`/dashboard/users/${profile.id}/requests`}
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
        profile={profile}
        setOpen={setOpenDeleteModal}
      />
      <VerifyProfileModal
        open={openVerifyModal}
        profile={profile}
        setOpen={setOpenVerifyModal}
      />
      <DisableProfileModal
        open={openDisableModal}
        profile={profile}
        setOpen={setOpenDisableModal}
      />
      <RejectProfileModal
        open={openRejectModal}
        profile={profile}
        setOpen={setOpenRejectModal}
      />
    </DropdownMenu>
  );
}
