import posthog from "posthog-js";
import { getClientEnv } from "./env.client";

if (getClientEnv().NEXT_PUBLIC_VERCEL_ENV === "production") {
	posthog.init(getClientEnv().NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
		api_host: "/ingest",
		ui_host: "https://us.posthog.com",
		defaults: "2026-01-30",
		capture_exceptions: true,
	});
}
