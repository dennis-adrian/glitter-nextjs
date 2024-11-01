import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import FullProfileButton from "@/app/public_profiles/[id]/full_profile_button";

type FullProfileProps = {
  profileId: number;
};

export default async function FullProfile(props: FullProfileProps) {
  const profile = await getCurrentUserProfile();
  if (profile?.role !== "admin") return null;

  return (
    <div className="mb-3 w-full flex justify-end">
      <FullProfileButton {...props} />
    </div>
  );
}
