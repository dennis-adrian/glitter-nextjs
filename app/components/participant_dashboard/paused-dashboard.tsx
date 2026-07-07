import { CakeIcon, CogIcon, PauseCircleIcon } from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";

import { ProfileType } from "@/app/api/users/definitions";
import ParticipationHistoryPreview from "@/app/components/participant_dashboard/participation-history-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PARTICIPANT_SUPPORT_EMAIL } from "@/app/lib/participants/helpers";

type Props = {
  profile: ProfileType;
};

export default function PausedParticipantDashboard({ profile }: Props) {
  return (
    <div className="container p-3 md:p-6">
      <div>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-sm text-slate-700 mb-1">
              <PauseCircleIcon className="size-4" />
              <span>Cuenta pausada</span>
            </div>
            <h1 className="font-bold tracking-tight text-3xl md:text-5xl">
              Hola, {profile.firstName ?? profile.displayName ?? "artista"}
            </h1>
            {profile.verifiedAt && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                <CakeIcon className="size-4" />
                Te uniste en {DateTime.fromJSDate(profile.verifiedAt).year}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" className="flex shrink-0" asChild>
            <Link href="/my_profile">
              <CogIcon className="size-4 mr-1" />
              Configuración
            </Link>
          </Button>
        </div>
        <Separator className="mt-4" />
      </div>

      <div className="mt-6 max-w-2xl">
        <Card className="border-slate-200 bg-slate-50/60">
          <CardContent className="p-5 space-y-3">
            <p className="font-semibold">Tu cuenta está pausada</p>
            <p className="text-sm text-muted-foreground">
              Pausamos algunas cuentas durante una limpieza de participantes
              inactivos. Esto no es una sanción. Podés seguir viendo tu perfil e
              historial, pero no podés aceptar términos ni recibir invitaciones
              hasta que un administrador reactive tu cuenta.
            </p>
            <Button asChild variant="outline">
              <Link href={`mailto:${PARTICIPANT_SUPPORT_EMAIL}`}>
                Solicitar reactivación
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <ParticipationHistoryPreview profile={profile} />
      </div>
    </div>
  );
}
