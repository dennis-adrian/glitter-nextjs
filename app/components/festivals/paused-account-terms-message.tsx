import { InfoIcon } from "lucide-react";

import { PARTICIPANT_SUPPORT_EMAIL } from "@/app/lib/participants/helpers";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";

export default function PausedAccountTermsMessage() {
  return (
    <div className="container mx-auto max-w-2xl p-6">
      <Alert>
        <InfoIcon />
        <AlertTitle>Tu perfil está pausado</AlertTitle>
        <AlertDescription>
          Para participar en este festival necesitás tener un perfil activo. Si
          tu perfil fue pausado por inactividad, podés solicitar que sea
          reactivado escribiendo al correo{" "}
          <span className="text-primary">{PARTICIPANT_SUPPORT_EMAIL}</span>
        </AlertDescription>
      </Alert>
    </div>
  );
}
