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
    <div className="mx-auto w-full max-w-lg p-5">
      <SignedIn>
        <PublicProfile profile={profile} />
        <AnnouncementCard profile={profile} />

        <Separator />

        <div className="my-4">
          <h1 className="text-xl font-bold">Información Personal</h1>
        </div>
        <div className="flex w-full flex-col gap-2">
          <NameField profile={profile} />
          <BirthdateField profile={profile} />
          <EmailField profile={profile} />
          <PhoneField profile={profile} />
        </div>
      </SignedIn>
    </div>
  );
}

export default UserProfile;
