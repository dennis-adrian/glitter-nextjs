import Landing from "@/app/components/landing/landing";
import LandingSkeleton from "@/app/components/landing/skeleton";
import ParticipantDashboard from "@/app/components/participant-dashboard/dashboard";
import DashboardSkeleton from "@/app/components/participant-dashboard/skeleton";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { Suspense } from "react";

export default async function Home() {
  return (
    <>
      <SignedOut>
        <Suspense fallback={<LandingSkeleton />}>
          <Landing />
        </Suspense>
      </SignedOut>
      <SignedIn>
        <Suspense fallback={<DashboardSkeleton />}>
          <ParticipantDashboard />
        </Suspense>
      </SignedIn>
    </>
  );
}
