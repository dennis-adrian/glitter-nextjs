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
import { formatDate } from "@/app/lib/formatters";
import { genderLabels } from "@/app/lib/utils";
import SocialMediaBadge from "@/app/components/social-media-badge";
import { DateTime } from "luxon";

export default function PrivateProfileOverview({
  profile,
}: {
  profile: ProfileType;
}) {
  let age = 0;
  if (profile.birthdate) {
    const birthDate = DateTime.fromJSDate(new Date(profile.birthdate));
    const now = DateTime.now();
    age = now.diff(birthDate, 'years').years;
    age = Math.floor(age); 
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span className="text-lg md:text-2xl font-bold">
            Información Personal
          </span>
          <Modal
            profile={profile}
            title="Editar Información Personal"
            FormComponent={Form}
          >
            <Button variant="outline" disabled={profile.status === "banned"}>
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
            value={`${formatDate(
              profile.birthdate!,
            ).toLocaleString()} (${age} años)`}
          />
          <ShowField label="Correo electrónico" value={profile.email} />
          <h3 className="font-bold">Número de teléfono</h3>
          <SocialMediaBadge
            socialMediaType="whatsapp"
            username={`${profile.phoneNumber}`}
          />
          <ShowField
            label="Género"
            value={genderLabels[profile.gender] || "No especificado"}
          />
          <ShowField
            label="Departamento de residencia"
            value={profile.state || "No especificado"}
          />
        </div>
      </CardContent>
    </Card>
  );
}
