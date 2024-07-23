"use client";

import NewTagForm from "@/app/components/tags/forms/new-tag";
import { Button } from "@/app/components/ui/button";
import {
  DrawerDialog,
  DrawerDialogClose,
  DrawerDialogContent,
  DrawerDialogFooter,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import { useMediaQuery } from "@/app/hooks/use-media-query";

type NewTagModalProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
};
export default function NewTagModal(props: NewTagModalProps) {
  const { open, setOpen } = props;
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <DrawerDialog isDesktop={isDesktop} open={open} onOpenChange={setOpen}>
      <DrawerDialogContent className="sm:max-w-[425px]" isDesktop={isDesktop}>
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Agregar Etiqueta
          </DrawerDialogTitle>
        </DrawerDialogHeader>

        <div className={`${isDesktop ? "" : "px-4"}`}>
          <NewTagForm onSuccess={() => setOpen(false)} />
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
