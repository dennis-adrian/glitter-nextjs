"use client";

import Link from "next/link";

import { CircleUserIcon, TriangleAlertIcon } from "lucide-react";

import SignOutButton from "@/app/components/user_dropdown/sign-out-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Shown to a signed-in user whose `users` row is missing — a sign-up whose
 * Clerk webhook has not landed yet, or a session that outlived a deleted
 * account. The entries that need a profile are dropped, but sign-out stays so
 * the session is never a dead end, and `/my_profile` explains the situation and
 * offers to sign out and back in.
 */
export default function MissingProfileDropdown() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="cursor-default"
        aria-label="Cuenta sin perfil"
      >
        <span className="relative inline-flex">
          <CircleUserIcon className="h-6 w-6" />
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-brand-elevated"
          />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="mr-4 max-w-64">
        <DropdownMenuLabel>
          <p>No encontramos tu perfil</p>
          <p className="text-xs font-normal text-muted-foreground">
            Puede ser un error temporal. Revisá tu perfil o volvé a iniciar
            sesión.
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/my_profile">
            <TriangleAlertIcon className="mr-2 h-4 w-4 text-amber-500" />
            <span>Revisar mi perfil</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <SignOutButton />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
