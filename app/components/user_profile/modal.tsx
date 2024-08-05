"use client";

import { useMediaQuery } from "@/hooks/use-media-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ProfileType } from "@/app/api/users/definitions";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <FormComponent profile={profile} onSuccess={() => setOpen(false)} />
        {isDesktop ? null : (
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
