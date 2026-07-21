"use client";

import { Modal } from "@/app/components/atoms/modal";
import GlobalRegisterInfractionForm from "@/app/components/infractions/global-register-form";
import { Button } from "@/app/components/ui/button";
import type { InfractionType } from "@/app/lib/infractions/definitions";
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type RegisterInfractionButtonProps = {
  infractionTypes: InfractionType[];
  festivals: { id: number; name: string }[];
};

export default function RegisterInfractionButton({
  infractionTypes,
  festivals,
}: RegisterInfractionButtonProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <PlusIcon className="w-4 h-4 mr-2" />
        Registrar infracción
      </Button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Registrar infracción"
      >
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <GlobalRegisterInfractionForm
            infractionTypes={infractionTypes}
            festivals={festivals}
            onSuccess={(infractionId) => {
              setOpen(false);
              router.push(`/dashboard/infractions/${infractionId}`);
              router.refresh();
            }}
          />
        </div>
      </Modal>
    </>
  );
}
