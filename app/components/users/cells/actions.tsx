import { MoreHorizontal, Trash2Icon } from "lucide-react";

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

export function ActionsCell({ user }: { user: ProfileType }) {
  const [openDeleteModal, setOpenDeleteModal] = useState(false);

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
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/users/${user.id}`}>Ver perfil</Link>
        </DropdownMenuItem>
        {user.userRequests.length > 0 && (
          <DropdownMenuItem>
            <Link href={`/dashboard/users/${user.id}/requests`}>
              Ver solicitudes
            </Link>
          </DropdownMenuItem>
        )}
        {/* {user.role !== "admin" && (
          <DropdownMenuItem> Volver admin</DropdownMenuItem>
        )} */}
        <DropdownMenuItem onClick={() => setOpenDeleteModal(true)}>
          <Trash2Icon className="h-4 w-4 mr-1" />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
      <DeleteProfileModal
        open={openDeleteModal}
        profile={user}
        setOpen={setOpenDeleteModal}
      />
    </DropdownMenu>
  );
}
