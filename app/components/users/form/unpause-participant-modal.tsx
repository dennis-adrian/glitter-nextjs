import { BaseProfile } from "@/app/api/users/definitions";
import { Button } from "@/app/components/ui/button";
import {
  DrawerDialog,
  DrawerDialogClose,
  DrawerDialogContent,
  DrawerDialogFooter,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import UnpauseParticipantForm from "@/app/components/users/form/unpause-participant-form";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { CircleCheckBigIcon } from "lucide-react";

export function UnpauseParticipantModal({
  open,
  profile,
  setOpen,
}: {
  open: boolean;
  profile: BaseProfile;
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
            Reactivar cuenta
          </DrawerDialogTitle>
        </DrawerDialogHeader>

        <div className={`${isDesktop ? "" : "px-4"}`}>
          <div className="flex items-center flex-col gap-6 m-auto text-center py-4">
            <CircleCheckBigIcon size={48} className="text-emerald-500" />
            <div className="flex flex-col gap-2">
              <p>
                ¿Querés reactivar la cuenta de <strong>{userLabel}</strong>?
              </p>
              <p>
                Esta cuenta volverá a poder aceptar términos y recibir
                invitaciones.
              </p>
            </div>
          </div>
          <UnpauseParticipantForm
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
