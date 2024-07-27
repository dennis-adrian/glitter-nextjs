import Landing from "@/app/components/landing/landing";
import LandingSkeleton from "@/app/components/landing/skeleton";
import { Suspense } from "react";

export default async function Home() {
  return (
    <>
      <Suspense fallback={<LandingSkeleton />}>
        <Landing />
      </Suspense>
    </>
  );
}
