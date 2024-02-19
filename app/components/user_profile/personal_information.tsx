import { ProfileType } from "@/app/api/users/definitions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import BirthdateField from "@/app/components/user_profile/birthdate/field";
import EmailField from "@/app/components/user_profile/email/field";
import NameField from "@/app/components/user_profile/name/field";
import PhoneField from "@/app/components/user_profile/phone/field";

export function PersonalInformation({ profile }: { profile: ProfileType }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Información Personal</CardTitle>
        <CardDescription>
          Esta información será visible solamente para el equipo de Glitter.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex w-full flex-col gap-2">
          <NameField profile={profile} />
          <BirthdateField profile={profile} />
          <EmailField profile={profile} />
          <PhoneField profile={profile} />
        </div>
      </CardContent>
    </Card>
  );
}
