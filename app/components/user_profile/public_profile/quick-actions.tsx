"use client";

import { useState } from "react";
import { CheckIcon, CogIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/app/components/ui/button";
import { VerifyProfileModal } from "@/app/components/users/form/verify-user-modal";
import { ProfileType } from "@/app/api/users/definitions";
import { profile } from "console";

type ProfileQuickActionsProps = {
  profile: ProfileType;
};

export default function ProfileQuickActions(props: ProfileQuickActionsProps) {
  const [openVerifyModal, setOpenVerifyModal] = useState(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <CogIcon className="h-6 w-6" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={props.profile.verified}
          onClick={() => setOpenVerifyModal(true)}
        >
          <CheckIcon className="h-4 w-4 mr-2" />
          <span>Verificar perfil</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
      <VerifyProfileModal
        open={openVerifyModal}
        profile={props.profile}
        setOpen={setOpenVerifyModal}
      />
    </DropdownMenu>
  );
}
