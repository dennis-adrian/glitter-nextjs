import posthog from "posthog-js";
import { getClientEnv } from "./env.client";
import { redactEventProperties } from "./app/lib/posthog-redaction";

if (getClientEnv().NEXT_PUBLIC_VERCEL_ENV === "production") {
  posthog.init(getClientEnv().NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-01-30",
    capture_exceptions: true,
    // The purchase page carries an access token in its query string, which
    // would otherwise land in `$current_url` on every autocaptured event.
    before_send: (event) => {
      if (!event?.properties) return event;
      return { ...event, properties: redactEventProperties(event.properties) };
    },
  });
}
