"use client";

import { Dropzone } from "@/app/components/organisms/dropzone";
import { Button } from "@/app/components/ui/button";
import {
  DrawerDialog,
  DrawerDialogClose,
  DrawerDialogContent,
  DrawerDialogFooter,
  DrawerDialogHeader,
  DrawerDialogTitle,
  DrawerDialogTrigger,
} from "@/app/components/ui/drawer-dialog";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { addFestivalActivityParticipantProof } from "@/app/lib/festival_sectors/actions";
import { UploadCloudIcon } from "lucide-react";
import { toast } from "sonner";

export default function UploadStickerDesignModal() {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <DrawerDialog isDesktop={isDesktop}>
      <DrawerDialogTrigger>
        <Button variant="outline">
          <span>Subir diseño</span>
          <UploadCloudIcon className="w-4 h-4 ml-2" />
        </Button>
      </DrawerDialogTrigger>
      <DrawerDialogContent isDesktop={isDesktop} className="max-w-md">
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Subir diseño
          </DrawerDialogTitle>
        </DrawerDialogHeader>
        <div className={`${isDesktop ? "" : "px-4"} pt-2`}>
          <Dropzone
            maxFiles={5}
            maxSize={2 * 1024 * 1024}
            accept={["image/*"]}
            onUploadComplete={async (imageUrls) => {
              const res = await addFestivalActivityParticipantProof(
                9,
                imageUrls,
              );
              if (res.success) {
                toast.success(res.message);
              } else {
                toast.error(res.message);
              }
            }}
          />
        </div>
        {isDesktop ? null : (
          <DrawerDialogFooter isDesktop={isDesktop} className="pt-2">
            <DrawerDialogClose isDesktop={isDesktop}>
              <Button variant="outline">Cerrar</Button>
            </DrawerDialogClose>
          </DrawerDialogFooter>
        )}
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
