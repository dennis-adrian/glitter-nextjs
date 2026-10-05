import TextInput from "@/app/components/form/fields/text";
import { UploadProductFormSchema } from "@/app/components/organisms/participant-products-upload";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { Progress } from "@/app/components/ui/progress";
import { createParticipantProduct } from "@/app/lib/participant_products/actions";
import { cn } from "@/app/lib/utils";
import { useUploadThing } from "@/app/vendors/uploadthing";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CloudUploadIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

/** An uploaded image and the receipt `createParticipantProduct` requires. */
export type SignedProductImage = { imageUrl: string; receipt: string };

/**
 * The `imageUploader` route returns the URL it signed with the receipt. That
 * URL is submitted rather than the upload response's own, so the pair always
 * matches.
 */
function readSignedUpload(serverData: unknown): SignedProductImage | null {
  if (!serverData || typeof serverData !== "object") return null;
  const { imageUrl, receipt } = serverData as {
    imageUrl?: unknown;
    receipt?: unknown;
  };
  if (typeof imageUrl !== "string" || typeof receipt !== "string") {
    return null;
  }
  return { imageUrl, receipt };
}

type UploadProductModalProps = {
  currentImage: File | null;
  form: UseFormReturn<z.infer<typeof UploadProductFormSchema>>;
  participationId: number;
  show: boolean;
  uploadedImage: SignedProductImage | null;
  setUploadedImage: (image: SignedProductImage | null) => void;
  onClose: () => void;
  onOpenChange: (open: boolean) => void;
};

export default function UploadProductModal({
  currentImage,
  form,
  participationId,
  show,
  uploadedImage,
  setUploadedImage,
  onClose,
  onOpenChange,
}: UploadProductModalProps) {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const { isUploading, startUpload } = useUploadThing("imageUploader", {
    onClientUploadComplete(res) {
      setUploadedImage(readSignedUpload(res[0]?.serverData));
      setUploadProgress(0);
    },
    onUploadError(error: Error) {
      toast.error("Error al subir la imagen");
    },
    onUploadProgress(progress) {
      setUploadProgress(progress);
    },
  });

  // Handle mobile keyboard detection
  useEffect(() => {
    const handleResize = () => {
      const viewportHeight = window.innerHeight;
      const screenHeight = screen.height;

      // Detect if keyboard is open (simplified heuristic)
      const keyboardThreshold = screenHeight * 0.75;
      setIsKeyboardOpen(viewportHeight < keyboardThreshold);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const action = form.handleSubmit(async (formData) => {
    if (!currentImage) {
      return;
    }

    // Use the existing upload or upload the new image
    let image = uploadedImage;
    if (!image) {
      const imageUploadResponse = await startUpload([currentImage]);
      if (!imageUploadResponse) {
        toast.error("No hay imagen para subir.");
        return;
      }

      image = readSignedUpload(imageUploadResponse[0]?.serverData);
      if (!image) {
        toast.error("Error al subir la imagen, intenta nuevamente");
        return;
      }
    }

    const result = await createParticipantProduct({
      ...formData,
      participationId: participationId,
      imageUrl: image.imageUrl,
      uploadReceipt: image.receipt,
    });

    if (result.success) {
      toast.success(result.message);
      onClose();
    } else {
      toast.error(result.message);
    }
  });

  return (
    <Dialog open={show} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "gap-3 max-w-md mx-auto max-h-[90vh] overflow-y-auto",
          "transition-all duration-300 ease-in-out",
          isKeyboardOpen && "max-h-[60vh]",
        )}
      >
        <DialogHeader className="flex flex-col">
          <DialogTitle className="text-xl md:text-2xl font-semibold">
            Agregar Producto
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Agrega los detalles del producto.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 items-center w-[120px] mx-auto">
            <div className="relative w-[120px] h-[120px] md:w-[180px] md:h-[180px] border border-gray-200 rounded-lg">
              {currentImage && (
                <Image
                  className="object-contain"
                  src={URL.createObjectURL(currentImage)}
                  alt="Product image"
                  fill
                />
              )}
              <div className="absolute bottom-2 right-2">
                <CloudUploadIcon
                  className={cn(
                    "w-5 h-5",
                    isUploading && "animate-pulse text-gray-500",
                    uploadedImage && !isUploading && "text-emerald-500",
                    !uploadedImage && !isUploading && "text-gray-500",
                  )}
                />
              </div>
            </div>
            {isUploading && (
              <Progress className="h-1 w-full" value={uploadProgress} />
            )}
          </div>
          <Form {...form}>
            <form className="flex flex-col gap-3" onSubmit={action}>
              <TextInput
                name="name"
                label="Nombre del producto*"
                placeholder="Escribe el nombre del producto"
              />
              <TextInput
                name="description"
                label="Descripción (opcional)"
                placeholder="Escribe una descripción corta"
              />
              <SubmitButton
                label="Agregar Producto"
                disabled={form.formState.isSubmitting || !currentImage}
                loading={form.formState.isSubmitting}
              />
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
