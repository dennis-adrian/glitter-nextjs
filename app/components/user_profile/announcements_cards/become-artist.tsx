import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import BecomeArtistForm from "./become-artist-form";
import { UserProfileType } from "@/app/api/users/actions";

export default function BecomeArtistCard({
  profile,
}: {
  profile: UserProfileType;
}) {
  return (
    <Card className="text-center">
      <CardHeader>
        <CardTitle>Conviértete en Artista</CardTitle>
      </CardHeader>
      <CardContent>
        <div>
          <p>
            Si eres un artista y te gustaría participar de los eventos que
            organiza <strong>Gliter</strong>, únete a nuestra comunidad.
          </p>
        </div>
      </CardContent>
      <CardFooter>
        <BecomeArtistForm userId={profile.id} />
      </CardFooter>
    </Card>
  );
}
