import BecomeArtistForm from "./become-artist-form";
import { ProfileType } from "@/app/api/users/definitions";
import { isProfileComplete } from "@/app/lib/utils";
import BaseCard from "./base-card";

export default function BecomeArtistCard({
  profile,
}: {
  profile: ProfileType;
}) {
  return (
    <BaseCard
      title="Conviértete en Artista"
      content={
        <div>
          <p>
            Si eres un artista y te gustaría participar de los eventos que
            organiza <strong>Glitter</strong>, únete a nuestra comunidad.
          </p>
          {!isProfileComplete(profile) && (
            <>
              <br />
              <p>
                <strong>
                  ¡Completa tu perfil e información personal para continuar!
                </strong>
              </p>
            </>
          )}
        </div>
      }
      footer={<BecomeArtistForm profile={profile} />}
    />
  );
}
