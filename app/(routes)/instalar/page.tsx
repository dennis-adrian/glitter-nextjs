import { DateTime } from "luxon";
import type { Metadata } from "next";

import InstallGuide from "@/app/components/install-guide/install-guide";
import InstallGuideIntro from "@/app/components/install-guide/install-guide-intro";
import { formatDisplayDate } from "@/app/lib/formatters";
import { isPushEnabledFor } from "@/app/lib/notifications/push/access";
import { pushPublicKey } from "@/app/lib/notifications/push/config";
import { fetchPushDevices } from "@/app/lib/notifications/push/devices";
import { resolveInboxViewer } from "@/app/lib/notifications/queries";

export const metadata: Metadata = {
  title: "Instalá Glitter",
  description:
    "Agregá Glitter a tu pantalla de inicio y activá las notificaciones para enterarte al instante de tus reservas, pagos y créditos.",
};

/**
 * How to install Glitter and turn on its notifications, for every device.
 *
 * Public, with no flag of its own: installing works for everyone already.
 * What it says about notifications follows the push flags for this viewer
 * (a signed-out visitor counts as one), so it never promises them before
 * they launch.
 */
export default async function InstallGuidePage() {
  const viewer = await resolveInboxViewer();
  const publicKey = pushPublicKey();
  const pushAvailable =
    publicKey != null && (await isPushEnabledFor(viewer ?? null));
  const devices =
    viewer && pushAvailable ? await fetchPushDevices(viewer.id) : [];

  return (
    <div className="container max-w-2xl p-3 md:p-6">
      <InstallGuideIntro pushAvailable={pushAvailable} />
      <InstallGuide
        pushAvailable={pushAvailable}
        signedIn={viewer != null}
        publicKey={pushAvailable ? publicKey : null}
        devices={devices.map((device) => ({
          id: device.id,
          label: device.label,
          lastUsedLabel: formatDisplayDate(
            device.lastUsedAt,
            DateTime.DATE_MED,
          ),
        }))}
      />
    </div>
  );
}
