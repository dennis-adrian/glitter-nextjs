"use client";

import { useUser } from "@clerk/nextjs";
import posthog from "posthog-js";
import { useEffect } from "react";

export default function PostHogAuthIdentify() {
	const { user, isLoaded } = useUser();

	useEffect(() => {
		if (!isLoaded) return;
		if (user) {
			posthog.identify(user.id, {
				email: user.primaryEmailAddress?.emailAddress,
			});
		} else {
			posthog.reset();
		}
	}, [user, isLoaded]);

	return null;
}
