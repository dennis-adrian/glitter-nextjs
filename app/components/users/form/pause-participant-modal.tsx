import { ParticipantProfile } from "@/app/lib/participants/definitions";
import { Button } from "@/app/components/ui/button";
import {
  DrawerDialog,
  DrawerDialogClose,
  DrawerDialogContent,
  DrawerDialogFooter,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import PauseParticipantForm from "@/app/components/users/form/pause-participant-form";
import PauseEligibilityBadge from "@/app/components/users/cells/pause-eligibility-badge";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { PauseCircleIcon } from "lucide-react";

export function PauseParticipantModal({
  open,
  profile,
  setOpen,
}: {
  open: boolean;
  profile: ParticipantProfile;
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
            Pausar participante
          </DrawerDialogTitle>
        </DrawerDialogHeader>

        <div className={`${isDesktop ? "" : "px-4"}`}>
          <div className="flex items-center flex-col gap-6 m-auto text-center py-4">
            <PauseCircleIcon size={48} className="text-slate-500" />
            <div className="flex flex-col gap-2">
              <p>
                ¿Querés pausar la cuenta de <strong>{userLabel}</strong>?
              </p>
              <p>
                Se enviará un correo explicando que es una limpieza de cuentas
                inactivas y no una sanción.
              </p>
              <PauseEligibilityBadge
                reason={profile.activitySummary.pauseEligibilityReason}
                isEligible={profile.activitySummary.isPauseEligible}
                className="mx-auto"
              />
            </div>
          </div>
          <PauseParticipantForm
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
