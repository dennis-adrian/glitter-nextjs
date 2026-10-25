import { MegaphoneIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/app/components/ui/button";
import { requireCommunicationsAdmin } from "@/app/lib/communications/access";

/** Writing and sending comunicados arrives in a later release. */
export default async function CommunicationsPage() {
  await requireCommunicationsAdmin();

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-12 text-center">
      <MegaphoneIcon className="h-10 w-10 text-muted-foreground" aria-hidden />
      <p className="max-w-md text-sm text-muted-foreground">
        Pronto vas a poder escribir y enviar comunicados desde acá. Mientras
        tanto, prepará las listas a las que se van a enviar.
      </p>
      <Button asChild variant="outline">
        <Link href="/dashboard/communications/lists">Ir a Listas</Link>
      </Button>
    </div>
  );
}
