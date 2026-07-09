import Link from "next/link";
import { PauseCircleIcon } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { PARTICIPANT_SUPPORT_EMAIL } from "@/app/lib/participants/helpers";

export default function PausedAccountTermsMessage() {
  return (
    <div className="container mx-auto max-w-2xl p-6">
      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="flex items-start gap-3">
            <PauseCircleIcon className="mt-1 h-6 w-6 text-slate-500" />
            <div className="space-y-3">
              <h1 className="text-2xl font-bold">Tu cuenta está pausada</h1>
              <p className="text-muted-foreground">
                Pausamos algunas cuentas durante una limpieza de participantes
                inactivos. Esto no es una sanción.
              </p>
              <p className="text-muted-foreground">
                Si querés participar en un próximo festival, escribinos para
                solicitar la reactivación de tu cuenta.
              </p>
            </div>
          </div>
          <Button asChild className="w-full sm:w-auto">
            <Link href={`mailto:${PARTICIPANT_SUPPORT_EMAIL}`}>
              Contactar a soporte
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
