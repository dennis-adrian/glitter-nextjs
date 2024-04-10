import { Button } from "@/app/components/ui/button";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import {
  DrawerDialog,
  DrawerDialogClose,
  DrawerDialogContent,
  DrawerDialogFooter,
} from "@/components/ui/drawer-dialog";
import Image from "next/image";

type PaymentProofModalProps = {
  imageUrl?: string;
  show: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function PaymentProofModal(props: PaymentProofModalProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <DrawerDialog
      isDesktop={isDesktop}
      open={props.show}
      onOpenChange={props.onOpenChange}
    >
      <DrawerDialogContent isDesktop={isDesktop}>
        <div className={`${isDesktop ? "" : "px-4"} py-4`}>
          {props.imageUrl && (
            <Image
              className="mx-auto"
              alt="Comprobante de pago"
              src={props.imageUrl}
              width={320}
              height={460}
            />
          )}
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
