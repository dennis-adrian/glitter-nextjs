"use client";

import { Button } from "@/app/components/ui/button";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import {
  DrawerDialog,
  DrawerDialogClose,
  DrawerDialogContent,
  DrawerDialogFooter,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/components/ui/drawer-dialog";
import { FC } from "react";

export const BaseModal: FC<{
  children: React.ReactNode;
  title?: string;
  show: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ children, title, show, onOpenChange }) => {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <DrawerDialog isDesktop={isDesktop} open={show} onOpenChange={onOpenChange}>
      <DrawerDialogContent isDesktop={isDesktop}>
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>{title}</DrawerDialogTitle>
        </DrawerDialogHeader>
        <div className={`${isDesktop ? "" : "px-4"}`}>{children}</div>
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
};

export default BaseModal;
