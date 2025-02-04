"use client";

import { useRouter } from "next/navigation";
import { use, useEffect } from "react";
import { ProfileType } from "@/app/api/users/definitions";
import { Loader2Icon } from "lucide-react";
import Loading from "@/app/(routes)/profile_verification/loading";

type Props = {
  profilePromise: Promise<ProfileType | null | undefined>;
};

export default function FetchExistingProfile({ profilePromise }: Props) {
  const router = useRouter();
  const profile = use(profilePromise);

  useEffect(() => {
    if (profile) {
      router.push("/my_profile");
    } else {
      router.push("/profile_verification?create=true");
    }
  }, [profile, router]);

  return <Loading />;
}
