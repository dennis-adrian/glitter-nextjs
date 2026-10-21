// @vitest-environment node
import { createECDH } from "crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ serverEnv: {} }));

import { vapidConfigProblem } from "@/app/lib/notifications/push/config";

function keyPair() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    VAPID_PUBLIC_KEY: ecdh.getPublicKey().toString("base64url"),
    // Node drops a private key's leading zero bytes; VAPID wants all 32.
    VAPID_PRIVATE_KEY: Buffer.from(
      ecdh.getPrivateKey("hex").padStart(64, "0"),
      "hex",
    ).toString("base64url"),
  };
}

const SUBJECT = "mailto:soporte@productoraglitter.com";

describe("vapidConfigProblem", () => {
  it("accepts a matching pair with a contact", () => {
    expect(vapidConfigProblem({ ...keyPair(), VAPID_SUBJECT: SUBJECT })).toBe(
      null,
    );
    expect(
      vapidConfigProblem({
        ...keyPair(),
        VAPID_SUBJECT: "https://productoraglitter.com",
      }),
    ).toBe(null);
  });

  it("reads nothing set as push being off, not as a problem to report", () => {
    expect(vapidConfigProblem({})).toBe("unset");
  });

  it("refuses keys from two different pairs, which would 403 every send", () => {
    const one = keyPair();
    const other = keyPair();
    expect(
      vapidConfigProblem({
        VAPID_PUBLIC_KEY: one.VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY: other.VAPID_PRIVATE_KEY,
        VAPID_SUBJECT: SUBJECT,
      }),
    ).toBe("VAPID_PRIVATE_KEY does not belong to VAPID_PUBLIC_KEY");
  });

  it("names the variable that is wrong, never its value", () => {
    const pair = keyPair();
    const problems = [
      vapidConfigProblem({ ...pair, VAPID_PUBLIC_KEY: "abc" }),
      vapidConfigProblem({ ...pair, VAPID_PRIVATE_KEY: "abc" }),
      vapidConfigProblem({ ...pair, VAPID_PRIVATE_KEY: undefined }),
      vapidConfigProblem({ ...pair }),
      vapidConfigProblem({ ...pair, VAPID_SUBJECT: "http://glitter.test" }),
      vapidConfigProblem({
        ...pair,
        VAPID_SUBJECT: "https://localhost:3000",
      }),
    ];
    expect(problems.map((problem) => problem?.split(" ")[0])).toEqual([
      "VAPID_PUBLIC_KEY",
      "VAPID_PRIVATE_KEY",
      "VAPID_PRIVATE_KEY",
      "VAPID_SUBJECT",
      "VAPID_SUBJECT",
      "VAPID_SUBJECT",
    ]);
    for (const problem of problems) {
      expect(problem).not.toContain(pair.VAPID_PRIVATE_KEY);
    }
  });
});
