import "server-only";

import { createECDH } from "crypto";

import { serverEnv } from "@/env";

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

function base64UrlBytes(value: string): Buffer | null {
  if (!BASE64URL_RE.test(value)) return null;
  return Buffer.from(value, "base64url");
}

/**
 * The problem with a VAPID setting, naming the variable and never its value.
 * Shapes are the ones `web-push` itself insists on: an uncompressed P-256
 * public key (65 bytes), a 32-byte private key, and a `mailto:` or `https:`
 * subject that is not localhost (Apple rejects that one).
 */
export function vapidConfigProblem(values: {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}): string | null {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = values;
  if (!VAPID_PUBLIC_KEY && !VAPID_PRIVATE_KEY && !VAPID_SUBJECT) {
    return "unset";
  }
  const publicKey = VAPID_PUBLIC_KEY && base64UrlBytes(VAPID_PUBLIC_KEY);
  if (!publicKey || publicKey.length !== 65 || publicKey[0] !== 0x04) {
    return "VAPID_PUBLIC_KEY is missing or not a 65-byte base64url P-256 key";
  }
  const privateKey = VAPID_PRIVATE_KEY && base64UrlBytes(VAPID_PRIVATE_KEY);
  if (!privateKey || privateKey.length !== 32) {
    return "VAPID_PRIVATE_KEY is missing or not a 32-byte base64url key";
  }
  // Keys from two different pairs pass every shape check, then every send
  // gets a 403 and nothing ever arrives.
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(privateKey);
    if (!ecdh.getPublicKey().equals(publicKey)) {
      return "VAPID_PRIVATE_KEY does not belong to VAPID_PUBLIC_KEY";
    }
  } catch {
    return "VAPID_PRIVATE_KEY is not a valid P-256 key";
  }
  let subject: URL | null = null;
  try {
    subject = VAPID_SUBJECT ? new URL(VAPID_SUBJECT) : null;
  } catch {
    subject = null;
  }
  if (
    !subject ||
    (subject.protocol !== "mailto:" && subject.protocol !== "https:") ||
    (subject.protocol === "https:" && subject.hostname === "localhost")
  ) {
    return "VAPID_SUBJECT is missing or not a mailto: or https: contact";
  }
  return null;
}

let reported = false;
let checked: { key: string; problem: string | null } | null = null;

/** The env does not change while the process runs; the ECDH check is not free. */
function cachedProblem() {
  const key = [
    serverEnv.VAPID_PUBLIC_KEY,
    serverEnv.VAPID_PRIVATE_KEY,
    serverEnv.VAPID_SUBJECT,
  ].join("\n");
  if (checked?.key !== key) {
    checked = { key, problem: vapidConfigProblem(serverEnv) };
  }
  return checked.problem;
}

/**
 * The VAPID key pair and contact, or null when push is off in this
 * environment. A partial or malformed setting also means off, logged once:
 * `next.config.ts` imports the env module, so throwing would break every
 * build over a feature that can simply stay dark.
 */
export function pushVapidConfig(): VapidConfig | null {
  const problem = cachedProblem();
  if (problem) {
    if (problem !== "unset" && !reported) {
      reported = true;
      console.error(`Web push is off: ${problem}.`);
    }
    return null;
  }
  return {
    publicKey: serverEnv.VAPID_PUBLIC_KEY!,
    privateKey: serverEnv.VAPID_PRIVATE_KEY!,
    subject: serverEnv.VAPID_SUBJECT!,
  };
}

/** The key browsers subscribe with, or null when push is off. Not a secret. */
export function pushPublicKey(): string | null {
  return pushVapidConfig()?.publicKey ?? null;
}
