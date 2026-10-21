// @vitest-environment node
import { createECDH, randomBytes } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const resolveInboxViewerMock = vi.hoisted(() => vi.fn());
const resolveInboxViewerWithAccessMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/notifications/queries", () => ({
  resolveInboxViewer: resolveInboxViewerMock,
  resolveInboxViewerWithAccess: resolveInboxViewerWithAccessMock,
}));

const featureFlagGuardMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/feature_flags/helpers", () => ({
  featureFlagGuard: featureFlagGuardMock,
}));

const pushVapidConfigMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/notifications/push/config", () => ({
  pushVapidConfig: pushVapidConfigMock,
}));

const savePushSubscriptionMock = vi.hoisted(() => vi.fn());
const refreshPushSubscriptionMock = vi.hoisted(() => vi.fn());
const removePushSubscriptionsMock = vi.hoisted(() => vi.fn());
const releaseForeignPushSubscriptionMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/notifications/push/devices", () => ({
  savePushSubscription: savePushSubscriptionMock,
  refreshPushSubscription: refreshPushSubscriptionMock,
  removePushSubscriptions: removePushSubscriptionsMock,
  releaseForeignPushSubscription: releaseForeignPushSubscriptionMock,
}));

const consumeActionRateLimitMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/rate-limit", () => ({
  consumeActionRateLimit: consumeActionRateLimitMock,
}));

import { MAX_SERIAL_ID } from "@/app/lib/notifications/definitions";
import {
  forgetPushDeviceAction,
  releaseForeignPushDeviceAction,
  removePushDeviceAction,
  savePushDeviceAction,
} from "@/app/lib/notifications/push/actions";

const VIEWER = { id: 42, role: "user" } as const;

const UNAVAILABLE = {
  success: false,
  message: "Esta funcionalidad no está disponible",
};
const INVALID = { success: false, message: "Datos inválidos." };
const UNSUPPORTED = {
  success: false,
  message:
    "Este navegador no puede recibir avisos. Probá con Chrome, Edge, Firefox o Safari actualizados.",
};

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/dXw7:APA91bHk-_AbC";

/** The keys a browser's `PushSubscription.toJSON()` hands over. */
function browserKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  };
}

function vapidConfig() {
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

let vapid: ReturnType<typeof vapidConfig>;

beforeEach(() => {
  vi.clearAllMocks();
  vapid = vapidConfig();
  resolveInboxViewerMock.mockResolvedValue(VIEWER);
  resolveInboxViewerWithAccessMock.mockResolvedValue(VIEWER);
  featureFlagGuardMock.mockResolvedValue(null);
  pushVapidConfigMock.mockReturnValue(vapid);
  consumeActionRateLimitMock.mockResolvedValue(true);
  savePushSubscriptionMock.mockResolvedValue(7);
  refreshPushSubscriptionMock.mockResolvedValue(7);
  removePushSubscriptionsMock.mockResolvedValue(1);
  releaseForeignPushSubscriptionMock.mockResolvedValue(true);
});

function expectNothingStored() {
  expect(savePushSubscriptionMock).not.toHaveBeenCalled();
  expect(refreshPushSubscriptionMock).not.toHaveBeenCalled();
}

describe("savePushDeviceAction", () => {
  it("is unavailable when signed out or the inbox is off for the person", async () => {
    resolveInboxViewerWithAccessMock.mockResolvedValue(null);

    const result = await savePushDeviceAction({
      endpoint: ENDPOINT,
      keys: browserKeys(),
    });

    expect(result).toEqual(UNAVAILABLE);
    expect(featureFlagGuardMock).not.toHaveBeenCalled();
    expect(consumeActionRateLimitMock).not.toHaveBeenCalled();
    expectNothingStored();
  });

  it("answers with the guard's own refusal when avisos are off for the person", async () => {
    const blocked = {
      success: false,
      message: "Esta funcionalidad no está disponible",
    } as const;
    featureFlagGuardMock.mockResolvedValue(blocked);

    const result = await savePushDeviceAction({
      endpoint: ENDPOINT,
      keys: browserKeys(),
    });

    expect(result).toBe(blocked);
    expect(featureFlagGuardMock).toHaveBeenCalledWith(
      "push_notifications",
      VIEWER,
    );
    expect(consumeActionRateLimitMock).not.toHaveBeenCalled();
    expectNothingStored();
  });

  it("says avisos are not available yet when this environment has no VAPID keys", async () => {
    pushVapidConfigMock.mockReturnValue(null);

    const result = await savePushDeviceAction({
      endpoint: ENDPOINT,
      keys: browserKeys(),
    });

    expect(result).toEqual({
      success: false,
      message: "Los avisos no están disponibles por ahora.",
    });
    expect(consumeActionRateLimitMock).not.toHaveBeenCalled();
    expectNothingStored();
  });

  it.each([
    [
      "a p256dh one byte short of a P-256 point",
      () => ({
        endpoint: ENDPOINT,
        keys: {
          ...browserKeys(),
          p256dh: randomBytes(64).toString("base64url"),
        },
      }),
    ],
    [
      "a p256dh one byte past a P-256 point",
      () => ({
        endpoint: ENDPOINT,
        keys: {
          ...browserKeys(),
          p256dh: randomBytes(66).toString("base64url"),
        },
      }),
    ],
    [
      "an 8-byte auth secret",
      () => ({
        endpoint: ENDPOINT,
        keys: { ...browserKeys(), auth: randomBytes(8).toString("base64url") },
      }),
    ],
    [
      "a p256dh in plain base64, with padding",
      () => {
        const ecdh = createECDH("prime256v1");
        ecdh.generateKeys();
        return {
          endpoint: ENDPOINT,
          keys: {
            ...browserKeys(),
            p256dh: ecdh.getPublicKey().toString("base64"),
          },
        };
      },
    ],
    [
      "an auth secret in plain base64, with padding",
      () => ({
        endpoint: ENDPOINT,
        keys: { ...browserKeys(), auth: randomBytes(16).toString("base64") },
      }),
    ],
    [
      "an endpoint past 1024 characters",
      () => ({
        endpoint: `https://fcm.googleapis.com/fcm/send/${"a".repeat(1100)}`,
        keys: browserKeys(),
      }),
    ],
    ["an empty endpoint", () => ({ endpoint: "", keys: browserKeys() })],
    ["no keys at all", () => ({ endpoint: ENDPOINT })],
    [
      "a label past 200 characters",
      () => ({
        endpoint: ENDPOINT,
        keys: browserKeys(),
        label: "x".repeat(201),
      }),
    ],
    ["something that is not a subscription", () => "subscription"],
  ])("refuses %s as invalid, before using up a try", async (_, input) => {
    const result = await savePushDeviceAction(input());

    expect(result).toEqual(INVALID);
    expect(consumeActionRateLimitMock).not.toHaveBeenCalled();
    expectNothingStored();
  });

  describe("an endpoint off the push service allowlist", () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warn.mockRestore();
    });

    it.each([
      [
        "plain http",
        "http://fcm.googleapis.com/fcm/send/capability-AbC123",
        "fcm.googleapis.com",
      ],
      [
        "another site",
        "https://evil.test/fcm/send/capability-AbC123",
        "evil.test",
      ],
      [
        "a host the two URL parsers read differently",
        "https://127.0.0.1;.fcm.googleapis.com/fcm/send/capability-AbC123",
        "invalid",
      ],
      [
        "a port",
        "https://fcm.googleapis.com:8443/fcm/send/capability-AbC123",
        "fcm.googleapis.com",
      ],
    ])(
      "is refused as an unsupported browser for %s, logging the host and never the endpoint",
      async (_, endpoint, host) => {
        const result = await savePushDeviceAction({
          endpoint,
          keys: browserKeys(),
        });

        expect(result).toEqual(UNSUPPORTED);
        expect(consumeActionRateLimitMock).not.toHaveBeenCalled();
        expectNothingStored();

        expect(warn).toHaveBeenCalledTimes(1);
        const logged = JSON.stringify(warn.mock.calls);
        expect(logged.includes(host)).toBe(true);
        expect(logged.includes(endpoint)).toBe(false);
        expect(logged.includes("capability-AbC123")).toBe(false);
      },
    );
  });

  it("spends a try from the bucket that turns avisos on, ten a minute", async () => {
    await savePushDeviceAction({ endpoint: ENDPOINT, keys: browserKeys() });

    expect(consumeActionRateLimitMock).toHaveBeenCalledTimes(1);
    expect(consumeActionRateLimitMock).toHaveBeenCalledWith({
      key: "push-device:user:42",
      limit: 10,
      windowMs: 60_000,
    });
  });

  it("spends a later visit's refresh from its own bucket, thirty a minute", async () => {
    await savePushDeviceAction({
      endpoint: ENDPOINT,
      keys: browserKeys(),
      refreshOnly: true,
    });

    expect(consumeActionRateLimitMock).toHaveBeenCalledTimes(1);
    expect(consumeActionRateLimitMock).toHaveBeenCalledWith({
      key: "push-device-refresh:user:42",
      limit: 30,
      windowMs: 60_000,
    });
  });

  it.each([
    [
      "the bucket is empty",
      () => consumeActionRateLimitMock.mockResolvedValue(false),
    ],
    [
      "the rate limit cannot be checked",
      () =>
        consumeActionRateLimitMock.mockRejectedValue(new Error("db is down")),
    ],
  ])("asks to wait a minute and saves nothing when %s", async (_, arrange) => {
    arrange();

    const result = await savePushDeviceAction({
      endpoint: ENDPOINT,
      keys: browserKeys(),
    });

    expect(result).toEqual({
      success: false,
      message: "Hiciste demasiados intentos. Esperá un minuto.",
    });
    expectNothingStored();
  });

  it("saves the browser under the viewer with the key the control subscribed it with", async () => {
    const keys = browserKeys();

    const result = await savePushDeviceAction({
      endpoint: ENDPOINT,
      keys,
      label: "Chrome en Android",
    });

    expect(result).toEqual({ success: true, deviceId: 7 });
    expect(savePushSubscriptionMock).toHaveBeenCalledTimes(1);
    expect(savePushSubscriptionMock).toHaveBeenCalledWith({
      userId: 42,
      endpoint: ENDPOINT,
      p256dh: keys.p256dh,
      auth: keys.auth,
      applicationServerKey: vapid.publicKey,
      label: "Chrome en Android",
    });
    expect(refreshPushSubscriptionMock).not.toHaveBeenCalled();
  });

  it("takes an auth secret longer than sixteen bytes", async () => {
    const keys = {
      ...browserKeys(),
      auth: randomBytes(32).toString("base64url"),
    };

    const result = await savePushDeviceAction({ endpoint: ENDPOINT, keys });

    expect(result).toEqual({ success: true, deviceId: 7 });
  });

  it.each([
    ["a newline", "Chrome en\nAndroid", "Chrome en Android"],
    [
      "tabs and runs of spaces",
      "  Safari\t\ten   iPhone  ",
      "Safari en iPhone",
    ],
    [
      "control characters",
      "Firefox\u0000en\u001bWindows\u007f",
      "Firefox en Windows",
    ],
    ["a label past 80 characters", "x".repeat(200), "x".repeat(80)],
    [
      "invisible controls and direction marks",
      "Chrome\u0085en\u202eAndroid\u200b",
      "Chrome en Android",
    ],
    ["a cut that would leave a space", `${"a".repeat(79)} b`, "a".repeat(79)],
    [
      "a cut that would split an emoji",
      `${"a".repeat(79)}😀😀`,
      `${"a".repeat(79)}😀`,
    ],
    ["only whitespace", "   \n\t ", null],
    ["only control characters", "\u0000\u0007\u001f", null],
    ["no label", null, null],
    ["a label left out", undefined, null],
  ])("keeps the label to one plain line for %s", async (_, label, expected) => {
    await savePushDeviceAction({
      endpoint: ENDPOINT,
      keys: browserKeys(),
      label,
    });

    expect(savePushSubscriptionMock).toHaveBeenCalledTimes(1);
    expect(savePushSubscriptionMock.mock.calls[0][0].label).toBe(expected);
  });

  it("is unavailable when the person's profile is being deleted", async () => {
    savePushSubscriptionMock.mockResolvedValue("deleting");

    const result = await savePushDeviceAction({
      endpoint: ENDPOINT,
      keys: browserKeys(),
    });

    expect(result).toEqual(UNAVAILABLE);
  });

  it("refuses as invalid a browser someone else holds when the keys do not match", async () => {
    savePushSubscriptionMock.mockResolvedValue(null);

    const result = await savePushDeviceAction({
      endpoint: ENDPOINT,
      keys: browserKeys(),
    });

    expect(result).toEqual(INVALID);
  });

  describe("on a later visit", () => {
    it("only refreshes the row, never adds one", async () => {
      const keys = browserKeys();

      const result = await savePushDeviceAction({
        endpoint: ENDPOINT,
        keys,
        label: "Edge en\nWindows",
        refreshOnly: true,
      });

      expect(result).toEqual({ success: true, deviceId: 7 });
      expect(savePushSubscriptionMock).not.toHaveBeenCalled();
      expect(refreshPushSubscriptionMock).toHaveBeenCalledTimes(1);
      expect(refreshPushSubscriptionMock).toHaveBeenCalledWith({
        userId: 42,
        endpoint: ENDPOINT,
        p256dh: keys.p256dh,
        auth: keys.auth,
        applicationServerKey: vapid.publicKey,
        label: "Edge en Windows",
      });
    });

    it("answers no device when the person removed it meanwhile", async () => {
      refreshPushSubscriptionMock.mockResolvedValue(null);

      const result = await savePushDeviceAction({
        endpoint: ENDPOINT,
        keys: browserKeys(),
        refreshOnly: true,
      });

      expect(result).toEqual({ success: true, deviceId: null });
      expect(savePushSubscriptionMock).not.toHaveBeenCalled();
    });
  });
});

describe("a device query that fails", () => {
  /** What drizzle throws: the failed query with its params in the message. */
  function failedQuery(keys: { p256dh: string; auth: string }) {
    return Object.assign(
      new Error(
        `Failed query: insert into "push_subscriptions" ...\nparams: ${ENDPOINT},${keys.p256dh},${keys.auth}`,
      ),
      { name: "DrizzleQueryError", cause: { code: "57P01" } },
    );
  }

  it.each([
    ["turning avisos on", false],
    ["a later visit", true],
  ])(
    "tells the person to try again and logs no endpoint or key, for %s",
    async (_, refreshOnly) => {
      const keys = browserKeys();
      const error = failedQuery(keys);
      savePushSubscriptionMock.mockRejectedValue(error);
      refreshPushSubscriptionMock.mockRejectedValue(error);
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await savePushDeviceAction({
        endpoint: ENDPOINT,
        keys,
        refreshOnly,
      });

      expect(result).toEqual({
        success: false,
        message:
          "No pudimos guardar los avisos de este dispositivo. Intentá de nuevo.",
      });
      const output = JSON.stringify(logged.mock.calls);
      expect(output).toContain("DrizzleQueryError");
      expect(output).toContain("57P01");
      expect(output).not.toContain(ENDPOINT);
      expect(output).not.toContain(keys.p256dh);
      expect(output).not.toContain(keys.auth);
      logged.mockRestore();
    },
  );

  it("does the same when forgetting, removing or releasing a device", async () => {
    const keys = browserKeys();
    removePushSubscriptionsMock.mockRejectedValue(failedQuery(keys));
    releaseForeignPushSubscriptionMock.mockRejectedValue(failedQuery(keys));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const results = [
      await forgetPushDeviceAction(ENDPOINT),
      await removePushDeviceAction(7),
      await releaseForeignPushDeviceAction({
        endpoint: ENDPOINT,
        auth: keys.auth,
      }),
    ];

    expect(results.every((result) => result.success === false)).toBe(true);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(ENDPOINT);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(keys.auth);
    logged.mockRestore();
  });
});

describe("removePushDeviceAction", () => {
  it("removes one of the viewer's own devices, whatever the flags say", async () => {
    resolveInboxViewerWithAccessMock.mockResolvedValue(null);
    featureFlagGuardMock.mockResolvedValue(UNAVAILABLE);
    pushVapidConfigMock.mockReturnValue(null);

    const result = await removePushDeviceAction(7);

    expect(result).toEqual({ success: true });
    expect(removePushSubscriptionsMock).toHaveBeenCalledTimes(1);
    expect(removePushSubscriptionsMock).toHaveBeenCalledWith(42, { ids: [7] });
    expect(featureFlagGuardMock).not.toHaveBeenCalled();
    expect(resolveInboxViewerWithAccessMock).not.toHaveBeenCalled();
  });

  it("is unavailable when signed out", async () => {
    resolveInboxViewerMock.mockResolvedValue(null);

    const result = await removePushDeviceAction(7);

    expect(result).toEqual(UNAVAILABLE);
    expect(removePushSubscriptionsMock).not.toHaveBeenCalled();
  });

  it.each([
    ["zero", 0],
    ["a negative id", -1],
    ["a fraction", 1.5],
    ["words", "abc"],
    ["an empty string", ""],
    ["nothing", null],
    ["a missing id", undefined],
    ["an id past the serial range", MAX_SERIAL_ID + 1],
    ["infinity", Number.POSITIVE_INFINITY],
    ["an object", { id: 7 }],
  ])("refuses %s as invalid", async (_, id) => {
    const result = await removePushDeviceAction(id);

    expect(result).toEqual(INVALID);
    expect(removePushSubscriptionsMock).not.toHaveBeenCalled();
  });
});

describe("forgetPushDeviceAction", () => {
  it("forgets this browser from the viewer's own devices only, whatever the flags say", async () => {
    resolveInboxViewerWithAccessMock.mockResolvedValue(null);
    featureFlagGuardMock.mockResolvedValue(UNAVAILABLE);

    const result = await forgetPushDeviceAction(ENDPOINT);

    expect(result).toEqual({ success: true });
    expect(removePushSubscriptionsMock).toHaveBeenCalledTimes(1);
    expect(removePushSubscriptionsMock).toHaveBeenCalledWith(42, {
      endpoint: ENDPOINT,
    });
    expect(featureFlagGuardMock).not.toHaveBeenCalled();
  });

  it("is unavailable when signed out", async () => {
    resolveInboxViewerMock.mockResolvedValue(null);

    const result = await forgetPushDeviceAction(ENDPOINT);

    expect(result).toEqual(UNAVAILABLE);
    expect(removePushSubscriptionsMock).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty endpoint", ""],
    ["an endpoint past 1024 characters", `${ENDPOINT}${"a".repeat(1100)}`],
    ["something that is not a string", 42],
    ["nothing", null],
  ])("refuses %s as invalid", async (_, endpoint) => {
    const result = await forgetPushDeviceAction(endpoint);

    expect(result).toEqual(INVALID);
    expect(removePushSubscriptionsMock).not.toHaveBeenCalled();
  });
});

describe("releaseForeignPushDeviceAction", () => {
  it.each([true, false])(
    "says whether a row under another account was let go (%s)",
    async (released) => {
      releaseForeignPushSubscriptionMock.mockResolvedValue(released);
      const { auth } = browserKeys();

      const result = await releaseForeignPushDeviceAction({
        endpoint: ENDPOINT,
        auth,
      });

      expect(result).toEqual({ success: true, released });
      expect(releaseForeignPushSubscriptionMock).toHaveBeenCalledTimes(1);
      expect(releaseForeignPushSubscriptionMock).toHaveBeenCalledWith({
        userId: 42,
        endpoint: ENDPOINT,
        auth,
      });
    },
  );

  it("always checks against the viewer, whatever user id the browser sends", async () => {
    const { auth } = browserKeys();

    await releaseForeignPushDeviceAction({
      endpoint: ENDPOINT,
      auth,
      userId: 99,
    });

    expect(releaseForeignPushSubscriptionMock).toHaveBeenCalledWith({
      userId: 42,
      endpoint: ENDPOINT,
      auth,
    });
  });

  it("works whatever the flags say", async () => {
    resolveInboxViewerWithAccessMock.mockResolvedValue(null);
    featureFlagGuardMock.mockResolvedValue(UNAVAILABLE);

    const result = await releaseForeignPushDeviceAction({
      endpoint: ENDPOINT,
      auth: browserKeys().auth,
    });

    expect(result).toEqual({ success: true, released: true });
    expect(featureFlagGuardMock).not.toHaveBeenCalled();
  });

  it("is unavailable when signed out", async () => {
    resolveInboxViewerMock.mockResolvedValue(null);

    const result = await releaseForeignPushDeviceAction({
      endpoint: ENDPOINT,
      auth: browserKeys().auth,
    });

    expect(result).toEqual(UNAVAILABLE);
    expect(releaseForeignPushSubscriptionMock).not.toHaveBeenCalled();
  });

  it.each([
    ["no auth secret", { endpoint: ENDPOINT }],
    ["an empty auth secret", { endpoint: ENDPOINT, auth: "" }],
    [
      "an auth secret past 256 characters",
      { endpoint: ENDPOINT, auth: "a".repeat(257) },
    ],
    ["an empty endpoint", { endpoint: "", auth: "abc" }],
    [
      "an endpoint past 1024 characters",
      { endpoint: `${ENDPOINT}${"a".repeat(1100)}`, auth: "abc" },
    ],
    ["something that is not an object", ENDPOINT],
  ])("refuses %s as invalid", async (_, input) => {
    const result = await releaseForeignPushDeviceAction(input);

    expect(result).toEqual(INVALID);
    expect(releaseForeignPushSubscriptionMock).not.toHaveBeenCalled();
  });
});
