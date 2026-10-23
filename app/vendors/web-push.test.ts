// @vitest-environment node
import { createECDH, randomBytes } from "crypto";
import webpush from "web-push";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  legacyParserAgrees,
  PUSH_TTL_SECONDS,
  sendPush,
} from "@/app/vendors/web-push";

function vapid() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey().toString("base64url"),
    // Node drops a private key's leading zero bytes; VAPID wants all 32.
    privateKey: Buffer.from(
      ecdh.getPrivateKey("hex").padStart(64, "0"),
      "hex",
    ).toString("base64url"),
    subject: "mailto:soporte@productoraglitter.com",
  };
}

function subscription(endpoint: string) {
  const device = createECDH("prime256v1");
  device.generateKeys();
  return {
    endpoint,
    keys: {
      p256dh: device.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("legacyParserAgrees", () => {
  it("agrees on real endpoints", () => {
    expect(
      legacyParserAgrees("https://fcm.googleapis.com/fcm/send/abc:APA91b"),
    ).toBe(true);
    expect(
      legacyParserAgrees(
        "https://wns2-par02p.notify.windows.com/w/?token=BQ%2b%3d",
      ),
    ).toBe(true);
  });

  it("catches a host Node's legacy parser would read as another", () => {
    expect(
      legacyParserAgrees("https://127.0.0.1;.fcm.googleapis.com/fcm/send/x"),
    ).toBe(false);
    expect(legacyParserAgrees("https://fcm.googleapis.com:444/x")).toBe(false);
    expect(legacyParserAgrees("not a url")).toBe(false);
  });
});

describe("sendPush", () => {
  it("builds a request every push service accepts, without the network", () => {
    const keys = vapid();
    const target = subscription("https://web.push.apple.com/QGuQyavXutnMH");
    const authorization = webpush.getVapidHeaders(
      "https://web.push.apple.com",
      keys.subject,
      keys.publicKey,
      keys.privateKey,
      "aes128gcm",
    ).Authorization;
    const details = webpush.generateRequestDetails(target, "x".repeat(2900), {
      TTL: PUSH_TTL_SECONDS,
      urgency: "normal",
      topic: "n2147483647",
      headers: { Authorization: authorization },
    });

    expect(details.headers.TTL).toBe(172_800);
    expect(details.headers.Urgency).toBe("normal");
    expect(details.headers.Topic).toBe("n2147483647");
    expect(details.headers.Authorization).toMatch(/^vapid t=.+, k=/);
    expect((details.body as Buffer).length).toBeLessThanOrEqual(4096);
  });

  it("hands the library options it accepts, and a body under 4 KB", async () => {
    const keys = vapid();
    const built: ReturnType<typeof webpush.generateRequestDetails>[] = [];
    vi.spyOn(webpush, "sendNotification").mockImplementation(
      async (target, payload, options) => {
        // The real request builder: it throws on any option it does not know.
        built.push(webpush.generateRequestDetails(target, payload, options));
        return { statusCode: 201, body: "", headers: {} };
      },
    );

    await sendPush(
      subscription("https://fcm.googleapis.com/fcm/send/a"),
      JSON.stringify({ title: "🎉".repeat(120), body: "\u0002".repeat(240) }),
      { vapid: keys, topic: "n2147483647", ttlSeconds: 172_800 },
    );

    const [request] = built;
    expect(request.headers).toMatchObject({
      TTL: 172_800,
      Urgency: "normal",
      Topic: "n2147483647",
      "Content-Encoding": "aes128gcm",
    });
    expect(request.headers.Authorization).toMatch(
      new RegExp(`^vapid t=[^,]+, k=${keys.publicKey}$`),
    );
    expect((request.body as Buffer).length).toBeLessThanOrEqual(4096);
  });

  it("sends only what is left of a late push's lifetime", async () => {
    const send = vi
      .spyOn(webpush, "sendNotification")
      .mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    await sendPush(subscription("https://web.push.apple.com/a"), "{}", {
      vapid: vapid(),
      topic: "n1",
      ttlSeconds: 3_600.7,
    });
    expect(send.mock.calls[0][2]?.TTL).toBe(3_600);
  });

  it("signs again once the hour is up", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const keys = vapid();
      vi.spyOn(webpush, "sendNotification").mockResolvedValue({
        statusCode: 201,
        body: "",
        headers: {},
      });
      const sign = vi.spyOn(webpush, "getVapidHeaders");
      const target = subscription(
        "https://updates.push.services.mozilla.com/w",
      );

      await sendPush(target, "{}", {
        vapid: keys,
        topic: "n1",
        ttlSeconds: 172_800,
      });
      vi.advanceTimersByTime(59 * 60 * 1000);
      await sendPush(target, "{}", {
        vapid: keys,
        topic: "n1",
        ttlSeconds: 172_800,
      });
      expect(sign).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2 * 60 * 1000);
      await sendPush(target, "{}", {
        vapid: keys,
        topic: "n1",
        ttlSeconds: 172_800,
      });
      expect(sign).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("signs once per push service and reuses the token, as Apple asks", async () => {
    const keys = vapid();
    const send = vi
      .spyOn(webpush, "sendNotification")
      .mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    const sign = vi.spyOn(webpush, "getVapidHeaders");

    await sendPush(subscription("https://web.push.apple.com/a"), "{}", {
      vapid: keys,
      topic: "n1",
      ttlSeconds: 172_800,
    });
    await sendPush(subscription("https://web.push.apple.com/b"), "{}", {
      vapid: keys,
      topic: "n2",
      ttlSeconds: 172_800,
    });
    await sendPush(
      subscription("https://fcm.googleapis.com/fcm/send/c"),
      "{}",
      {
        vapid: keys,
        topic: "n3",
        ttlSeconds: 172_800,
      },
    );

    expect(sign).toHaveBeenCalledTimes(2);
    const [, , options] = send.mock.calls[1];
    expect(options).toMatchObject({
      TTL: PUSH_TTL_SECONDS,
      urgency: "normal",
      topic: "n2",
      timeout: 10_000,
    });
    expect(options?.headers?.Authorization).toBe(
      send.mock.calls[0][2]?.headers?.Authorization,
    );
    // Never the library's own VAPID handling, which throws on missing keys.
    expect(options).not.toHaveProperty("vapidDetails");
  });

  it("refuses to send where the legacy parser would connect elsewhere", async () => {
    const send = vi.spyOn(webpush, "sendNotification");
    await expect(
      sendPush(
        subscription("https://127.0.0.1;.fcm.googleapis.com/fcm/send/x"),
        "{}",
        { vapid: vapid(), topic: "n1", ttlSeconds: 172_800 },
      ),
    ).rejects.toThrow("push_endpoint_rejected");
    expect(send).not.toHaveBeenCalled();
  });
});
