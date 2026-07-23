"use client";

import { Modal } from "@/app/components/atoms/modal";
import CreateSanctionForm from "@/app/components/sanctions/create-form";
import { Button } from "@/app/components/ui/button";
import type { EligibleInfractionOption } from "@/app/lib/sanctions/queries";
import { ScaleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type CreateSanctionButtonProps = {
  userId: number;
  preselectedInfraction: EligibleInfractionOption;
  participantLabel: string;
};

export default function CreateSanctionButton({
  userId,
  preselectedInfraction,
  participantLabel,
}: CreateSanctionButtonProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  if (preselectedInfraction.status === "voided") {
    return null;
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <ScaleIcon className="w-4 h-4 mr-2" />
        Aplicar sanción
      </Button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Aplicar sanción"
      >
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <CreateSanctionForm
            userId={userId}
            participantLabel={participantLabel}
            initialInfractions={[preselectedInfraction]}
            onSuccess={(sanctionId) => {
              setOpen(false);
              router.push(`/dashboard/sanctions/${sanctionId}`);
              router.refresh();
            }}
          />
        </div>
      </Modal>
    </>
  );
}
