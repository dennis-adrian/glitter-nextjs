import { Suspense } from "react";
import DashboardUsersPage from "@/app/components/pages/dashboard/users";
import Loader from "@/app/components/loader";

export default async function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <DashboardUsersPage />
    </Suspense>
  );
}
