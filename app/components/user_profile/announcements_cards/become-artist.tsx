import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import BecomeArtistForm from "./become-artist-form";
import { UserProfileWithRequests } from "@/app/api/users/actions";
import { isProfileComplete } from "@/app/lib/utils";

export default function BecomeArtistCard({
  profile,
}: {
  profile: UserProfileWithRequests;
}) {
  return (
    <Card className="my-4 p-2 text-center">
      <CardHeader className="p-3">
        <CardTitle className="text-lg leading-6">
          Conviértete en Artista
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 text-sm">
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
      </CardContent>
      <CardFooter className="p-2">
        <BecomeArtistForm profile={profile} />
      </CardFooter>
    </Card>
  );
}
