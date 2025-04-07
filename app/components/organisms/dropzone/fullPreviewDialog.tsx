import { Dialog, DialogContent, DialogTitle } from "@/app/components/ui/dialog";
import Image from "next/image";
import { XIcon } from "lucide-react";
import { Button } from "@/app/components/ui/button";

type FullPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewDimensions: { width: number; height: number };
  files: File[];
};
export default function FullPreviewDialog({
  open,
  onOpenChange,
  previewDimensions,
  files,
}: FullPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-none bg-black/60 border-none shadow-none h-full w-full flex items-center justify-center"
        showCloseButton={false}
      >
        {previewDimensions && (
          <>
            <DialogTitle className="sr-only">Vista previa</DialogTitle>
            <div className="relative min-w-0 min-h-0 max-w-none max-h-none">
              <Image
                src={URL.createObjectURL(files[0])}
                alt={files[0].name}
                width={previewDimensions.width}
                height={previewDimensions.height}
                className="max-w-none mx-auto"
                unoptimized
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="absolute top-4 right-4 text-white bg-black border-none rounded-full hover:bg-black/50 hover:text-white"
              onClick={() => onOpenChange(false)}
            >
              <XIcon className="w-4 h-4" />
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
