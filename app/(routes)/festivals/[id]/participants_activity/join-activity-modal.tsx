"use client";

import StickerPrintDesignSelectable from "@/app/(routes)/festivals/[id]/participants_activity/sticker-print-design-selectable";
import { Button } from "@/app/components/ui/button";
import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogDescription,
  DrawerDialogHeader,
  DrawerDialogTitle,
  DrawerDialogTrigger,
} from "@/app/components/ui/drawer-dialog";
import {
  ActivityDetailsWithParticipants,
  FestivalActivityWithDetailsAndParticipants,
} from "@/app/data/festivals/definitions";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { ArrowDownToLineIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

type JoinActivityModalProps = {
  activity: FestivalActivityWithDetailsAndParticipants;
};

export default function JoinActivityModal({
  activity,
}: JoinActivityModalProps) {
  const [selectedDesign, setSelectedDesign] =
    useState<ActivityDetailsWithParticipants | null>(null);

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
            {activity.details.map((detail) => (
              <StickerPrintDesignSelectable
                key={detail.id}
                detail={detail}
                selected={selectedDesign?.id === detail.id}
                setSelected={setSelectedDesign}
              />
            ))}
          </div>
          <div className="flex justify-center mt-2">
            <Button className="w-full md:max-w-[400px] self-end">
              <span>Guardar selección</span>
              <ArrowDownToLineIcon className="ml-2 w-4 h-4" />
            </Button>
          </div>
        </div>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
