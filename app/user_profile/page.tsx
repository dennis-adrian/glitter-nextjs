import { currentUser, SignedIn } from "@clerk/nextjs";

import { fetchUserProfile } from "@/app/api/users/actions";
import { ProfileType } from "@/app/api/users/definitions";

import { Separator } from "@/app/components/ui/separator";
import BirthdateField from "@/app/components/user_profile/birthdate/field";
import EmailField from "@/app/components/user_profile/email/field";
import NameField from "@/app/components/user_profile/name/field";
import PhoneField from "@/app/components/user_profile/phone/field";
import AnnouncementCard from "@/components/user_profile/announcements_cards/card";
import PublicProfile from "@/components/user_profile/public_profile/profile";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { PersonalInformation } from "@/app/components/user_profile/personal_information";

async function UserProfile() {
  const user = await currentUser();
  let profile: ProfileType | null = null;
  if (user) {
    const data = await fetchUserProfile(user.id);
    profile = data.user!;
  }

  if (!profile) {
    return <div>Loading...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-screen-md p-4">
      <SignedIn>
        <div className="flex flex-col gap-4">
          <AnnouncementCard profile={profile} />
          <PublicProfile profile={profile} />
          <PersonalInformation profile={profile} />
        </div>
      </SignedIn>
    </div>
  );
}

export default UserProfile;
