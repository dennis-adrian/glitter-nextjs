import { ParticipantProfile } from "@/app/lib/participants/definitions";
import { Modal } from "@/app/components/atoms/modal";
import PauseParticipantForm from "@/app/components/users/form/pause-participant-form";
import PauseEligibilityBadge from "@/app/components/users/cells/pause-eligibility-badge";
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
  const userLabel =
    profile.displayName ||
    `${profile.firstName || ""} ${profile.lastName || ""}`;

  return (
    <Modal isOpen={open} onClose={() => setOpen(false)}>
      <div className="flex flex-col items-center gap-3 text-center my-4">
        <h1 className="text-xl font-bold">Pausar participante</h1>
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
        <PauseParticipantForm
          profile={profile}
          onSuccess={() => setOpen(false)}
        />
      </div>
    </Modal>
  );
}
