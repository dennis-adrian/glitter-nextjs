import { PostHog } from "posthog-node";

const noop = new Proxy({} as PostHog, {
	get: () => async () => {},
});

export function getPostHogClient(): PostHog {
	if (process.env.VERCEL_ENV !== "production") return noop;
	return new PostHog(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
		host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
		flushAt: 1,
		flushInterval: 0,
	});
}
