import { ProfileType } from "@/app/api/users/definitions";
import { getMissingProfileFields, isProfileComplete } from "@/app/lib/utils";
import BaseCard from "./base-card";

export default function MissingFieldsCard({
  profile,
}: {
  profile: ProfileType;
}) {
  const missingFields = getMissingProfileFields(profile);
  const publicFields = missingFields.filter((field) => field.isPublic);
  const privateFields = missingFields.filter((field) => !field.isPublic);

  return (
    <BaseCard
      className="text-foreground from-indigo-200/10 to-blue-300/10"
      content={
        <div>
          {isProfileComplete(profile) ? (
            <p>
              Gracias por completar tu perfil. Te enviaremos un correo cuando
              sea verificado.
            </p>
          ) : (
            <div>
              <p>
                Si quieres participar de los eventos que organiza{" "}
                <strong>Glitter</strong>, necesitas completar tu perfil.
              </p>
              <div className="mt-2">
                <h3 className="text-base font-semibold">
                  Esto es lo que le falta a tu perfil
                </h3>
                <div className="flex flex-col gap-2">
                  {publicFields.length > 0 && (
                    <div>
                      <h4 className="font-semibold">Perfil público</h4>
                      <ul>
                        {publicFields.map((field) => {
                          return (
                            <li
                              key={field.key}
                              className="text-destructive text-sm"
                            >
                              - {field.label}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  {privateFields.length > 0 && (
                    <div>
                      <h4 className="font-semibold">Información Personal</h4>
                      <ul>
                        {privateFields.map((field) => {
                          return (
                            <li
                              key={field.key}
                              className="text-destructive text-sm"
                            >
                              - {field.label}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      }
    />
  );
}
