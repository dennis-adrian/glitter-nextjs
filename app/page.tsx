import { redirect } from "next/navigation";
import { Suspense } from "react";

import Landing from "@/app/components/landing/landing";
import LandingSkeleton from "@/app/components/landing/skeleton";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function Home() {
	const profile = await getCurrentUserProfile();
	if (profile) {
		redirect("/portal");
	}

	return (
		<>
			<Suspense fallback={<LandingSkeleton />}>
				<Landing />
			</Suspense>
		</>
	);
}
