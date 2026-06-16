"use client";

import { type VariantProps } from "class-variance-authority";
import {
  BanIcon,
  CircleCheckBigIcon,
  CircleCheckIcon,
  CogIcon,
  PenBoxIcon,
  ReceiptIcon,
  TagsIcon,
  Trash2Icon,
  UserIcon,
  XCircleIcon,
} from "lucide-react";

import { ProfileType } from "@/app/api/users/definitions";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { DeleteProfileModal } from "@/app/components/users/form/delete-profile-modal";
import { VerifyProfileModal } from "@/app/components/users/form/verify-user-modal";
import { DisableProfileModal } from "@/app/components/users/form/disable-profile-modal";
import { RejectProfileModal } from "@/app/components/users/form/reject-profile-modal";

export default function ProfileQuickActions({
  profile,
  hideViewProfile,
  pendingPaymentsByFestival,
  triggerVariant = "outline",
  triggerSize = "icon",
  triggerClassName,
  children,
}: {
  hideViewProfile?: boolean;
  profile: ProfileType;
  pendingPaymentsByFestival?:
    | { festivalId: number; festivalName: string; count: number }[]
    | undefined;
  /** Menu trigger uses Radix’s native button (no `asChild`) so it always renders reliably. */
  triggerVariant?: VariantProps<typeof buttonVariants>["variant"];
  triggerSize?: VariantProps<typeof buttonVariants>["size"];
  triggerClassName?: string;
  children?: ReactNode;
}) {
  const [openDeleteModal, setOpenDeleteModal] = useState(false);
  const [openVerifyModal, setOpenVerifyModal] = useState(false);
  const [openDisableModal, setOpenDisableModal] = useState(false);
  const [openRejectModal, setOpenRejectModal] = useState(false);
  const allowVerify = profile.status !== "verified";

  const triggerContent = children ?? (
    <CogIcon className="h-6 w-6 shrink-0" aria-hidden />
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        className={cn("shrink-0", triggerClassName)}
        aria-label={children ? undefined : "Acciones"}
      >
        {triggerContent}
      </DropdownMenuTrigger>
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
        {pendingPaymentsByFestival?.map(
          ({ festivalId, festivalName, count }) => (
            <DropdownMenuItem key={festivalId} asChild>
              <Link
                className="flex items-center gap-1"
                href={`/profiles/${profile.id}/festivals/${festivalId}/invoices`}
              >
                <ReceiptIcon className="h-4 w-4" />
                Pagos pendientes · {festivalName} ({count})
              </Link>
            </DropdownMenuItem>
          ),
        )}
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
          <DropdownMenuItem asChild>
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
