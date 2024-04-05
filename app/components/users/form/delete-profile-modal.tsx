import { ProfileType } from "@/app/api/users/definitions";
import { Button } from "@/app/components/ui/button";
import {
  DrawerDialog,
  DrawerDialogClose,
  DrawerDialogContent,
  DrawerDialogFooter,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import { DeleteProfileForm } from "@/app/components/users/form/delete-profile-form";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { AlertCircleIcon } from "lucide-react";

export function DeleteProfileModal({
  open,
  profile,
  setOpen,
}: {
  open: boolean;
  profile: ProfileType;
  setOpen: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const userLabel =
    profile.displayName ||
    `${profile.firstName || ""} ${profile.lastName || ""}`;

  return (
    <DrawerDialog isDesktop={isDesktop} open={open} onOpenChange={setOpen}>
      <DrawerDialogContent className="sm:max-w-[425px]" isDesktop={isDesktop}>
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Eliminar Reserva Usuario
          </DrawerDialogTitle>
        </DrawerDialogHeader>

        <div className={`${isDesktop ? "" : "px-4"}`}>
          <div className="flex items-center flex-col gap-6 m-auto text-center py-4">
            <AlertCircleIcon size={48} className="text-red-500" />
            <div className="flex flex-col gap-2">
              <p>
                ¿Estás seguro que deseas eliminar a <strong>{userLabel}</strong>
                ?
              </p>
              <p>
                El usuario será eliminado de la base de datos. Esta acción no se
                puede deshacer.
              </p>
            </div>
          </div>
          <DeleteProfileForm
            profile={profile}
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
