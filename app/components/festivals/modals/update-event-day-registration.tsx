import UpdateEventDayRegistrationForm from "@/app/components/festivals/forms/update-event-day-registration";
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

export default function UpdateEventRegistrationModal({
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
            {festival.publicRegistration
              ? "Deshabilitar Registro en Puerta"
              : "Habilitar Registro en Puerta"}
          </DrawerDialogTitle>
        </DrawerDialogHeader>

        <div className={`${isDesktop ? "" : "px-4"}`}>
          <div className="flex items-center flex-col gap-6 m-auto text-center py-4">
            <AlertCircleIcon size={48} className="text-amber-500" />
            <div className="flex flex-col gap-2">
              {festival.publicRegistration ? (
                <>
                  <p>
                    ¿Estás seguro que deseas deshabilitar la acreditación para
                    el festival <strong>{festival.name}</strong>?
                  </p>
                </>
              ) : (
                <>
                  <p>
                    ¿Estás seguro que deseas habilitar el registro en puerta
                    para el festival <strong>{festival.name}</strong>?
                  </p>
                </>
              )}
            </div>
          </div>
          <UpdateEventDayRegistrationForm
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
