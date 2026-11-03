import { DateTime } from "luxon";
import type { Metadata } from "next";
import QRCode from "qrcode";

import InstallGuide from "@/app/components/install-guide/install-guide";
import InstallGuideIntro from "@/app/components/install-guide/install-guide-intro";
import { formatDisplayDate } from "@/app/lib/formatters";
import { INSTALL_GUIDE_PATH } from "@/app/lib/install-guide/definitions";
import { isPushEnabledFor } from "@/app/lib/notifications/push/access";
import { pushPublicKey } from "@/app/lib/notifications/push/config";
import { fetchPushDevices } from "@/app/lib/notifications/push/devices";
import { resolveInboxViewer } from "@/app/lib/notifications/queries";
import { publicBaseUrl } from "@/app/lib/urls";

export const metadata: Metadata = {
  title: "Instalá Glitter",
  description:
    "Agregá Glitter a la pantalla de inicio de tu teléfono y activá las notificaciones para enterarte al instante de tus reservas, pagos y créditos.",
};

/**
 * How to install Glitter on a phone and turn on its notifications. A
 * computer gets a QR code that opens this page on the phone.
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
  const installUrl = `${publicBaseUrl()}${INSTALL_GUIDE_PATH}`;
  const [devices, qrSvg] = await Promise.all([
    viewer && pushAvailable ? fetchPushDevices(viewer.id) : [],
    // Only a computer shows it, but the server cannot tell which one this is.
    QRCode.toString(installUrl, { type: "svg", margin: 1 }).catch(() => null),
  ]);

  return (
    <div className="container max-w-2xl p-3 md:p-6">
      <InstallGuideIntro pushAvailable={pushAvailable} />
      <InstallGuide
        pushAvailable={pushAvailable}
        signedIn={viewer != null}
        publicKey={pushAvailable ? publicKey : null}
        installUrl={installUrl}
        qrSvg={qrSvg}
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
