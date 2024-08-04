import { Suspense } from "react";
import UserProfileCreatePage from "@/app/components/profile-creation/page/user-profile-create";
import Loader from "@/app/components/loader";

export default async function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <UserProfileCreatePage />
    </Suspense>
  );
}
