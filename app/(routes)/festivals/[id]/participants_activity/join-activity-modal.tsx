"use client";

import { Button } from "@/app/components/ui/button";
import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogDescription,
  DrawerDialogHeader,
  DrawerDialogTitle,
  DrawerDialogTrigger,
} from "@/app/components/ui/drawer-dialog";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import Image from "next/image";

export default function JoinActivityModal() {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <DrawerDialog isDesktop={isDesktop}>
      <DrawerDialogTrigger isDesktop={isDesktop}>
        <Button className="w-full md:max-w-[400px] self-end">
          Inscribirme
        </Button>
      </DrawerDialogTrigger>
      <DrawerDialogContent isDesktop={isDesktop} className="p-3">
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Inscripción al Sticker-Print
          </DrawerDialogTitle>
          <DrawerDialogDescription isDesktop={isDesktop} className="text-left">
            Selecciona una imagen para elegir el diseño para participar en la
            actividad del Sticker-Print.
          </DrawerDialogDescription>
        </DrawerDialogHeader>
        <div className={`${isDesktop ? "" : "px-4"} pb-2`}>
          <div className="grid grid-cols-2 gap-2 md:gap-4">
            <div className="flex flex-col gap-1">
              <Image
                src="/img/sticker-print-1-320x480.png"
                alt="Sticker Print 1"
                width={320}
                height={480}
              />
              <p className="text-xs text-muted-foreground">Participantes</p>
            </div>
            <div className="flex flex-col gap-1">
              <Image
                src="/img/sticker-print-2-320x480.png"
                alt="Sticker Print 2"
                width={320}
                height={480}
              />
              <p className="text-xs text-muted-foreground">Participantes</p>
            </div>
            <div className="flex flex-col gap-1">
              <Image
                src="/img/sticker-print-3-320x480.png"
                alt="Sticker Print 3"
                width={320}
                height={480}
              />
              <p className="text-xs text-muted-foreground">Participantes</p>
            </div>
            <div className="flex flex-col gap-1">
              <Image
                src="/img/sticker-print-4-320x480.png"
                alt="Sticker Print 4"
                width={320}
                height={480}
              />
              <p className="text-xs text-muted-foreground">Participantes</p>
            </div>
          </div>
          <div className="flex justify-center mt-2">
            <Button className="w-full md:max-w-[400px] self-end">
              Inscribirme
            </Button>
          </div>
        </div>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
