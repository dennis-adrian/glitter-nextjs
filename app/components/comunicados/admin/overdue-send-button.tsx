"use client";

import { SendIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import SendConfirmDialog from "@/app/components/comunicados/admin/send-confirm-dialog";
import { Button } from "@/app/components/ui/button";

/**
 * "Enviar ahora" on a schedule still waiting past its time
 * (docs/IMPLEMENTATION-comunicados.md E6), on its list row and its page. The
 * confirm dialog counts and sends what is stored, at the version the page
 * read: a change of date or a release since then is refused or answered as
 * already sending. Once sent, its page shows the report.
 */
export default function OverdueSendButton({
  comunicadoId,
  version,
  size = "default",
}: {
  comunicadoId: number;
  version: number;
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size={size}
        className="shrink-0 self-start sm:self-auto"
        onClick={() => setOpen(true)}
      >
        <SendIcon className="mr-2 h-4 w-4" aria-hidden />
        Enviar ahora
      </Button>
      <SendConfirmDialog
        comunicadoId={comunicadoId}
        open={open}
        onOpenChange={setOpen}
        knownVersion={version}
        // Frozen: there is no autosave to pause (E1).
        onBeforeSend={async () => () => {}}
        onSent={() => router.push(`/dashboard/communications/${comunicadoId}`)}
      />
    </>
  );
}
