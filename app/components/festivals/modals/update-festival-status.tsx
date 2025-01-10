import UpdateFestivalForm from "@/app/components/festivals/forms/update-festival-status";
import { Button } from "@/app/components/ui/button";
import {
  DrawerDialog,
  DrawerDialogClose,
  DrawerDialogContent,
  DrawerDialogFooter,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { AlertCircleIcon } from "lucide-react";

export default function UpdateFestivalStatusModal({
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
            {festival.status === "active"
              ? "Deshabilitar Festival"
              : "Activar Festival"}
          </DrawerDialogTitle>
        </DrawerDialogHeader>

        <div className={`${isDesktop ? "" : "px-4"}`}>
          <div className="flex items-center flex-col gap-6 m-auto text-center py-4">
            <AlertCircleIcon size={48} className="text-amber-500" />
            <div className="flex flex-col gap-2">
              {festival.status === "active" && (
                <>
                  <p>
                    ¿Estás seguro que deseas deshabilitar el festival{" "}
                    <strong>{festival.name}</strong>?
                  </p>
                  <p>
                    El público ya no podrá ver la información sobre el evento
                  </p>
                </>
              )}

              {festival.status === "draft" && (
                <>
                  <p>
                    ¿Estás seguro que deseas activar el festival{" "}
                    <strong>{festival.name}</strong>?
                  </p>
                  <p>
                    Todos los usuarios que tengan su perfil verificado recibirán
                    un correo electrónico invitándolos a participar.
                  </p>
                </>
              )}
            </div>
          </div>
          <UpdateFestivalForm
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
