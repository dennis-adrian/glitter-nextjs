"use server";

import { z } from "zod";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import { MAX_SERIAL_ID } from "@/app/lib/notifications/definitions";
import { pushVapidConfig } from "@/app/lib/notifications/push/config";
import {
  refreshPushSubscription,
  releaseForeignPushSubscription,
  removePushSubscriptions,
  savePushSubscription,
} from "@/app/lib/notifications/push/devices";
import {
  isAllowedPushEndpoint,
  MAX_ENDPOINT_LENGTH,
  pushEndpointHost,
} from "@/app/lib/notifications/push/endpoint";
import {
  resolveInboxViewer,
  resolveInboxViewerWithAccess,
} from "@/app/lib/notifications/queries";
import { consumeActionRateLimit } from "@/app/lib/rate-limit";

type ActionResult = { success: boolean; message?: string };

const UNAVAILABLE = {
  success: false,
  message: "Esta funcionalidad no está disponible",
} as const;

const INVALID = { success: false, message: "Datos inválidos." } as const;

/** Base64url that decodes to exactly or at least `bytes` bytes. */
function base64UrlKey(bytes: number, exact: boolean) {
  return z
    .string()
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/)
    .refine((value) => {
      const length = Buffer.from(value, "base64url").length;
      return exact ? length === bytes : length >= bytes;
    });
}

const subscriptionSchema = z.object({
  endpoint: z.string().min(1).max(MAX_ENDPOINT_LENGTH),
  keys: z.object({
    // An uncompressed P-256 point and the 16-byte auth secret, as
    // `PushSubscription.toJSON()` gives them; `web-push` refuses anything else.
    p256dh: base64UrlKey(65, true),
    auth: base64UrlKey(16, false),
  }),
  label: z.string().max(200).nullish(),
  /** A later visit: refresh the row if it is still there, never add it. */
  refreshOnly: z.boolean().optional(),
});

const idSchema = z.coerce.number().int().positive().max(MAX_SERIAL_ID);

/** A label is only shown to its owner, but still kept to one plain line. */
function cleanLabel(label: string | null | undefined) {
  // Control characters and invisible direction marks become spaces; the cut
  // counts characters, so it never splits an emoji.
  const plain = (label ?? "")
    .replace(
      /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(plain).slice(0, 80).join("").trim() || null;
}

/**
 * Saves this browser as one of the person's devices when they turn avisos on.
 * With `refreshOnly`, on a later visit, it only refreshes "Último uso" and the
 * keys of a row that is still there, and answers `deviceId: null` when the
 * person removed it meanwhile. The id lets the list mark "Este dispositivo".
 */
export async function savePushDeviceAction(
  input: unknown,
): Promise<ActionResult & { deviceId?: number | null }> {
  const viewer = await resolveInboxViewerWithAccess();
  if (!viewer) return UNAVAILABLE;
  const blocked = await featureFlagGuard("push_notifications", viewer);
  if (blocked) return blocked;
  const vapid = pushVapidConfig();
  if (!vapid) {
    return {
      success: false,
      message: "Los avisos no están disponibles por ahora.",
    };
  }

  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const { endpoint, keys, label, refreshOnly } = parsed.data;
  if (!isAllowedPushEndpoint(endpoint)) {
    console.warn("Push device refused: unknown push service", {
      host: pushEndpointHost(endpoint),
    });
    return {
      success: false,
      message:
        "Este navegador no puede recibir avisos. Probá con Chrome, Edge, Firefox o Safari actualizados.",
    };
  }

  // Separate buckets: reading the inbox on a phone re-syncs on every visit,
  // and must not use up the taps that turn avisos on.
  const allowed = await consumeActionRateLimit({
    key: refreshOnly
      ? `push-device-refresh:user:${viewer.id}`
      : `push-device:user:${viewer.id}`,
    limit: refreshOnly ? 30 : 10,
    windowMs: 60_000,
  }).catch(() => false);
  if (!allowed) {
    return {
      success: false,
      message: "Hiciste demasiados intentos. Esperá un minuto.",
    };
  }
  const device = {
    userId: viewer.id,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    // The key the control handed the browser; see `pushSubscriptions`.
    applicationServerKey: vapid.publicKey,
    label: cleanLabel(label),
  };
  if (refreshOnly) {
    return { success: true, deviceId: await refreshPushSubscription(device) };
  }
  const deviceId = await savePushSubscription(device);
  if (deviceId === "deleting") return UNAVAILABLE;
  if (deviceId == null) return INVALID;
  return { success: true, deviceId };
}

/**
 * Removes one of the person's devices from the list, or this one when they
 * turn avisos off here. Open to anyone signed in, flags or not: a device must
 * stay removable after a rollout is paused.
 */
export async function removePushDeviceAction(
  id: unknown,
): Promise<ActionResult> {
  const viewer = await resolveInboxViewer();
  if (!viewer) return UNAVAILABLE;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return INVALID;
  await removePushSubscriptions(viewer.id, { ids: [parsed.data] });
  return { success: true };
}

/**
 * Checked once per session on a browser that holds a push subscription: if
 * Glitter has it under another account (whoever used this browser before
 * never signed out), the row goes, and the browser should unsubscribe.
 * Open to anyone signed in, flags or not.
 */
export async function releaseForeignPushDeviceAction(
  input: unknown,
): Promise<ActionResult & { released?: boolean }> {
  const viewer = await resolveInboxViewer();
  if (!viewer) return UNAVAILABLE;
  const parsed = z
    .object({
      endpoint: z.string().min(1).max(MAX_ENDPOINT_LENGTH),
      auth: z.string().min(1).max(256),
    })
    .safeParse(input);
  if (!parsed.success) return INVALID;
  const released = await releaseForeignPushSubscription({
    userId: viewer.id,
    ...parsed.data,
  });
  return { success: true, released };
}

/**
 * Forgets this browser when the person signs out, so whoever uses it next
 * does not get their avisos. Only ever removes the viewer's own row.
 */
export async function forgetPushDeviceAction(
  endpoint: unknown,
): Promise<ActionResult> {
  const viewer = await resolveInboxViewer();
  if (!viewer) return UNAVAILABLE;
  const parsed = z.string().min(1).max(MAX_ENDPOINT_LENGTH).safeParse(endpoint);
  if (!parsed.success) return INVALID;
  await removePushSubscriptions(viewer.id, { endpoint: parsed.data });
  return { success: true };
}
