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
import { VerifyProfileForm } from "@/app/components/users/form/verify-user-form";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { AlertCircleIcon } from "lucide-react";

export function VerifyProfileModal({
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
            Verificación de Perfil
          </DrawerDialogTitle>
        </DrawerDialogHeader>

        <div className={`${isDesktop ? "" : "px-4"}`}>
          <div className="flex items-center flex-col gap-6 m-auto text-center py-4">
            <AlertCircleIcon size={48} className="text-amber-500" />
            <div className="flex flex-col gap-2">
              <p>
                ¿Estás seguro que deseas verificar a{" "}
                <strong>{userLabel}</strong>?
              </p>
              <p>
                El usuario recibira un correo electrónico confirmando la
                verificación.
              </p>
            </div>
          </div>
          <VerifyProfileForm
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
