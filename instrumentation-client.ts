import posthog from "posthog-js";
import { getClientEnv } from "./env.client";
import { recordFirstStandaloneLaunch } from "./app/lib/install-guide/first-launch";
import { listenForInstallPrompt } from "./app/lib/install-guide/install-prompt";
import {
  detectInstallContext,
  deviceSystemGroup,
  installPlatformGroup,
} from "./app/lib/install-guide/platform";
import { isStandaloneApp } from "./app/lib/notifications/push/support";
import { captureClientEvent } from "./app/lib/posthog-capture";
import { POSTHOG_EVENTS } from "./app/lib/posthog-events";
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
      try {
        return {
          ...event,
          properties: redactEventProperties(event.properties),
        };
      } catch (error) {
        // Dropped rather than sent through: if redaction failed we cannot say
        // the URL is clean, and losing one event beats shipping a credential.
        console.error("[posthog] redaction failed, event dropped", error);
        return null;
      }
    },
  });

  // Every event says whether it came from the installed app, so pageviews
  // and funnels can be split by it.
  try {
    posthog.register({
      display_mode: isStandaloneApp(window) ? "standalone" : "browser",
    });
  } catch (error) {
    console.error("[posthog] register failed", error);
  }
}

// Before the app runs: the browser offers to install once per page load, and
// often before hydration. `/instalar`'s button shows the offer kept here.
try {
  // Read now: Chrome on a computer may move the tab into the app's window
  // once installed, and by then it reads as the installed app.
  const platform = installPlatformGroup(detectInstallContext(window).platform);
  // The first open of the installed app on this device: the install count
  // iPhone can give, where no install event exists. It always runs in the
  // installed app, where `platform` above reads `installed`, so it names the
  // device instead.
  if (recordFirstStandaloneLaunch(window)) {
    captureClientEvent(POSTHOG_EVENTS.FIRST_STANDALONE_LAUNCH, {
      platform: deviceSystemGroup(window),
    });
  }
  listenForInstallPrompt({
    onInstalled: () =>
      captureClientEvent(POSTHOG_EVENTS.APP_INSTALLED, { platform }),
  });
} catch (error) {
  console.error("[install] could not listen for the install prompt", error);
}
