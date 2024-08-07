"use client";

import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { FC } from "react";

export const BaseModal: FC<{
  children: React.ReactNode;
  title?: string;
  show: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ children, title, show, onOpenChange }) => {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <Dialog open={show} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className={`${isDesktop ? "" : "px-4"}`}>{children}</div>
        {isDesktop ? null : (
          <DialogFooter className="pt-2">
            <DialogClose>
              <Button className="w-full" variant="outline">
                Cerrar
              </Button>
            </DialogClose>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BaseModal;
