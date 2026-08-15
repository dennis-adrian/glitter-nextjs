import "server-only";

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";

import { consumeActionRateLimit } from "@/app/lib/rate-limit";

const POS_CREDENTIAL_RESOLUTION_LIMIT = 30;
const POS_CREDENTIAL_RESOLUTION_WINDOW_MS = 60_000;

/** One bounded bucket per client, independent of attacker-controlled IDs. */
export async function consumePosCredentialResolutionRateLimit(): Promise<boolean> {
  try {
    const requestHeaders = await headers();
    const candidates = [
      requestHeaders.get("cf-connecting-ip"),
      requestHeaders.get("x-real-ip"),
      requestHeaders.get("x-forwarded-for")?.split(",")[0],
    ];
    const clientIdentifier =
      candidates
        .map((value) => value?.trim())
        .find((value) => value && isIP(value)) ?? "unknown";
    const digest = createHash("sha256").update(clientIdentifier).digest("hex");

    return await consumeActionRateLimit({
      key: `fast-pass-pos-credential:${digest}`,
      limit: POS_CREDENTIAL_RESOLUTION_LIMIT,
      windowMs: POS_CREDENTIAL_RESOLUTION_WINDOW_MS,
    });
  } catch {
    return false;
  }
}
