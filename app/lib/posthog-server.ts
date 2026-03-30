import { PostHog } from "posthog-node";
import { getClientEnv, serverEnv } from "@/env";

const noop = new Proxy({} as PostHog, {
	get: () => async () => {},
});

export function getPostHogClient(): PostHog {
	if (serverEnv.VERCEL_ENV !== "production") return noop;
	return new PostHog(getClientEnv().NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
		host: getClientEnv().NEXT_PUBLIC_POSTHOG_HOST,
		flushAt: 1,
		flushInterval: 0,
	});
}
