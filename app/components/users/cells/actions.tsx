import { MoreHorizontal } from "lucide-react";

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

export function ActionsCell({ user }: { user: ProfileType }) {
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
        {/* <DropdownMenuItem
              onClick={() =>
                navigator.clipboard.writeText(user.id.toString())
              }
            >
              Copy payment ID
            </DropdownMenuItem> */}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/users/${user.id}`}>
            Ver perfil
          </Link>
        </DropdownMenuItem>
        {user.userRequests.length > 0 && (
          <DropdownMenuItem>
            <Link href={`/dashboard/users/${user.id}/requests`}>
              Ver solicitudes
            </Link>
          </DropdownMenuItem>
        )}
        {user.role !== "admin" && (
          <DropdownMenuItem> Volver admin</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
