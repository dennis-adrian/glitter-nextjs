"use client";

import { useMediaQuery } from "@/hooks/use-media-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DrawerDialog,
  DrawerDialogClose,
  DrawerDialogContent,
  DrawerDialogFooter,
  DrawerDialogHeader,
  DrawerDialogTitle,
  DrawerDialogTrigger,
} from "@/components/ui/drawer-dialog";
import { ProfileType } from "@/app/api/users/definitions";
import ProfilePictureField from "@/app/components/user_profile/profile_pic/field";
import ProfilePictureForm from "@/app/components/user_profile/profile_pic/form";

type EditUserModalProps = {
  children: React.ReactNode;
  profile: ProfileType;
  title: string;
  FormComponent: React.ComponentType<{
    profile: ProfileType;
    onSuccess: () => void;
  }>;
};

export default function EditUserModal({
  children,
  profile,
  title,
  FormComponent,
}: EditUserModalProps) {
  const [open, setOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <DrawerDialog isDesktop={isDesktop} open={open} onOpenChange={setOpen}>
      <DrawerDialogTrigger isDesktop={isDesktop}>
        {children}
      </DrawerDialogTrigger>
      <DrawerDialogContent className="sm:max-w-[425px]" isDesktop={isDesktop}>
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>{title}</DrawerDialogTitle>
        </DrawerDialogHeader>

        <div className={`${isDesktop ? "" : "px-4"}`}>
          <FormComponent profile={profile} onSuccess={() => setOpen(false)} />
        </div>
        {isDesktop ? null : (
          <DrawerDialogFooter isDesktop={isDesktop} className="pt-2">
            <DrawerDialogClose isDesktop={isDesktop}>
              <Button variant="outline">Cancelar</Button>
            </DrawerDialogClose>
          </DrawerDialogFooter>
        )}
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
