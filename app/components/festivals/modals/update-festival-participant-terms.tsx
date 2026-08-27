import UpdateFestivalParticipantTermsForm from "@/app/components/festivals/forms/update-festival-participant-terms";
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
import { FestivalBase } from "@/app/lib/festivals/definitions";
import { AlertCircleIcon } from "lucide-react";

export default function UpdateFestivalParticipantTermsModal({
  open,
  festival,
  setOpen,
}: {
  open: boolean;
  festival: FestivalBase;
  setOpen: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <DrawerDialog isDesktop={isDesktop} open={open} onOpenChange={setOpen}>
      <DrawerDialogContent className="sm:max-w-[425px]" isDesktop={isDesktop}>
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>
            {festival.participantTermsEnabled
              ? "Deshabilitar términos para participantes"
              : "Habilitar términos para participantes"}
          </DrawerDialogTitle>
        </DrawerDialogHeader>

        <div className={`${isDesktop ? "" : "px-4"}`}>
          <div className="flex items-center flex-col gap-6 m-auto text-center py-4">
            <AlertCircleIcon size={48} className="text-amber-500" />
            <div className="flex flex-col gap-2">
              {festival.participantTermsEnabled ? (
                <>
                  <p>
                    ¿Deseas deshabilitar el acceso a los términos y condiciones
                    para participantes en <strong>{festival.name}</strong>?
                  </p>
                  <p>
                    Los participantes no podrán leer ni aceptar términos hasta
                    que vuelvas a habilitarlos.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    ¿Deseas habilitar el acceso a los términos y condiciones
                    para participantes en <strong>{festival.name}</strong>?
                  </p>
                  <p>
                    Los participantes podrán ver y aceptar la versión publicada
                    del documento global de términos.
                  </p>
                </>
              )}
            </div>
          </div>
          <UpdateFestivalParticipantTermsForm
            festival={festival}
            onSuccess={() => setOpen(false)}
          />
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
