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
import { UploadCloudIcon } from "lucide-react";

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
            maxFiles={1}
            maxSize={2 * 1024 * 1024}
            accept={["image/*"]}
            onFilesAdded={(files) => {
              console.log(files);
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
