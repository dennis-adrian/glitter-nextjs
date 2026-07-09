import { BaseProfile } from "@/app/api/users/definitions";
import { Modal } from "@/app/components/atoms/modal";
import UnpauseParticipantForm from "@/app/components/users/form/unpause-participant-form";
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
  const userLabel =
    profile.displayName ||
    `${profile.firstName || ""} ${profile.lastName || ""}`;

  return (
    <Modal isOpen={open} onClose={() => setOpen(false)}>
      <div className="flex flex-col items-center gap-3 text-center my-4">
        <h1 className="text-xl font-bold">Reactivar cuenta</h1>
        <CircleCheckBigIcon size={48} className="text-emerald-500" />
        <div className="flex flex-col gap-2">
          <p>
            ¿Querés reactivar la cuenta de <strong>{userLabel}</strong>?
          </p>
          <p>
            Esta cuenta volverá a poder aceptar términos y recibir invitaciones.
          </p>
        </div>
        <UnpauseParticipantForm
          profile={profile}
          onSuccess={() => setOpen(false)}
        />
      </div>
    </Modal>
  );
}
