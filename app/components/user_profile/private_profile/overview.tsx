import { FilePenLineIcon } from "lucide-react";

import { ProfileType } from "@/app/api/users/definitions";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import Modal from "@/components/user_profile/modal";
import Form from "./form";
import { ShowField } from "@/app/components/user_profile/show-field";

export default function PrivateProfileOverview({
  profile,
}: {
  profile: ProfileType;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          Información Personal
          <Modal
            profile={profile}
            title="Editar Información Personal"
            FormComponent={Form}
          >
            <Button variant="ghost">
              <FilePenLineIcon className="mr-1 h-4 w-4" />
              Editar
            </Button>
          </Modal>
        </CardTitle>
        <CardDescription>
          Esta información será visible solamente para el equipo de Glitter.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex w-full flex-col gap-2">
          <ShowField
            label="Nombre completo"
            value={`${profile.firstName || ""} ${profile.lastName || ""}`}
          />
          <ShowField
            label="Fecha de nacimiento"
            value={profile.birthdate?.toLocaleDateString("es-ES")}
          />
          <ShowField label="Correo electrónico" value={profile.email} />
          <ShowField
            label="Número de teléfono"
            value={profile?.phoneNumber && `+591 ${profile?.phoneNumber}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}
