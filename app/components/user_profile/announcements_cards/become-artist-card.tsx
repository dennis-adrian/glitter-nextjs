import BecomeArtistForm from "./become-artist-form";
import { ProfileType } from "@/app/api/users/definitions";
import { getMissingProfileFields, isProfileComplete } from "@/app/lib/utils";
import BaseCard from "./base-card";

export default function BecomeArtistCard({
  profile,
}: {
  profile: ProfileType;
}) {
  const missingFields = getMissingProfileFields(profile);
  const publicFields = missingFields.filter((field) => field.isPublic);
  const privateFields = missingFields.filter((field) => !field.isPublic);

  return (
    <BaseCard
      className="bg-gradient-to-r from-fuchsia-600 to-pink-600"
      title="Conviértete en Artista"
      content={
        <div>
          <p>
            Si eres un artista y te gustaría participar de los eventos que
            organiza <strong>Glitter</strong>, únete a nuestra comunidad.
          </p>
          {!isProfileComplete(profile) && (
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
                          <li key={field.key} className="text-sm">
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
                          <li key={field.key} className="text-sm">
                            - {field.label}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      }
      footer={<BecomeArtistForm profile={profile} />}
    />
  );
}
