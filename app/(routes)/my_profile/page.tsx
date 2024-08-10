import { Suspense } from "react";
import Loader from "@/app/components/loader";
import MyProfilePage from "@/app/components/pages/my_profile/user-profile";

export default async function UserProfile() {
  return (
    <Suspense fallback={<Loader />}>
      <MyProfilePage />
    </Suspense>
  );
}
