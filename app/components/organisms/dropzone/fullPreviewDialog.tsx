import { Dialog, DialogContent, DialogTitle } from "@/app/components/ui/dialog";
import Image from "next/image";
import { XIcon } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

type FullPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewDimensions: { width: number; height: number };
  file: File | null;
};
export default function FullPreviewDialog({
  open,
  onOpenChange,
  previewDimensions,
  file,
}: FullPreviewDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // aritificially loading so that the preview dimensions are updated for the image
  useEffect(() => {
    if (open) {
      setIsLoading(true);
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!file) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 w-dvw h-dvh min-w-full bg-black/60 flex justify-center items-center"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Vista previa</DialogTitle>
        {isLoading ? (
          <div className="flex items-center justify-center w-full h-full">
            <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          previewDimensions && (
            <div className="relative min-w-0 min-h-0 max-w-none max-h-none">
              <Image
                src={URL.createObjectURL(file)}
                alt={file.name}
                width={previewDimensions.width}
                height={previewDimensions.height}
                className="max-w-none mx-auto"
                unoptimized
              />
            </div>
          )
        )}
      </DialogContent>
      {mounted &&
        open &&
        createPortal(
          <div className="fixed top-4 right-4 z-[9999] pointer-events-auto">
            <Button
              variant="outline"
              size="icon"
              className="text-white bg-black border-none rounded-full hover:bg-black/50 hover:text-white"
              onClick={() => onOpenChange(false)}
            >
              <XIcon className="w-4 h-4" />
            </Button>
          </div>,
          document.body,
        )}
    </Dialog>
  );
}
