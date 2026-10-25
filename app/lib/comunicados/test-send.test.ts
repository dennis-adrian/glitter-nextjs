// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  serverEnv: { VERCEL_ENV: "preview" as string, RESEND_API_KEY: "re_test" },
}));
const {
  getCurrentUserProfileMock,
  featureFlagGuardMock,
  consumeActionRateLimitMock,
  sendEmailMock,
  isSuppressedMock,
  rowsByTable,
  db,
} = vi.hoisted(() => {
  const rowsByTable = new Map<unknown, unknown[]>();
  const select = vi.fn(() => ({
    from: (table: unknown) => ({
      where: () => ({
        limit: async () => rowsByTable.get(table) ?? [],
      }),
    }),
  }));
  const write = () => {
    throw new Error("A test send must not write to the database");
  };
  return {
    getCurrentUserProfileMock: vi.fn(),
    featureFlagGuardMock: vi.fn(),
    consumeActionRateLimitMock: vi.fn(),
    sendEmailMock: vi.fn(),
    isSuppressedMock: vi.fn(),
    rowsByTable,
    db: {
      select,
      insert: vi.fn(write),
      update: vi.fn(write),
      delete: vi.fn(write),
      execute: vi.fn(write),
      transaction: vi.fn(write),
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => env);
vi.mock("@/db", () => ({ db }));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: getCurrentUserProfileMock,
}));
vi.mock("@/app/lib/feature_flags/helpers", () => ({
  featureFlagGuard: featureFlagGuardMock,
}));
vi.mock("@/app/lib/rate-limit", () => ({
  consumeActionRateLimit: consumeActionRateLimitMock,
}));
vi.mock("@/app/vendors/resend", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/app/lib/emails/suppressions", () => ({
  isSuppressed: isSuppressedMock,
}));

import {
  COMUNICADO_TEST_SEND_LIMIT,
  COMUNICADO_TEST_SEND_WINDOW_MS,
} from "@/app/lib/comunicados/definitions";
import {
  COMUNICADOS_FROM,
  COMUNICADOS_FROM_STAGING,
} from "@/app/lib/comunicados/email";
import { sendComunicadoTestAction } from "@/app/lib/comunicados/test-send";
import { verifyUnsubscribeToken } from "@/app/lib/emails/unsubscribe-tokens";
import { comunicados, festivals } from "@/db/schema";

const BASE = "https://preview.glitter.example";
const ADMIN = {
  id: 42,
  role: "admin",
  email: "dennis@gmail.com",
  displayName: null,
  firstName: "Dennis",
  lastName: "Guzmán",
};

const DRAFT = {
  id: 7,
  status: "draft",
  title: "Cambio de horario de armado",
  doc: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "El armado se adelanta. Revisá ", styles: {} },
        {
          type: "link",
          href: "/my_participations",
          content: [{ type: "text", text: "tu reserva", styles: {} }],
        },
      ],
    },
  ],
  actionLabel: "Ver mi reserva",
  actionPath: "/my_participations",
  audience: { festivals: [], lists: [], people: [] },
  essential: false,
  essentialReason: null,
};

type SentPayload = {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
};

function sent(call = 0) {
  const [payload, options] = sendEmailMock.mock.calls[call] as [
    SentPayload,
    { idempotencyKey: string },
  ];
  return { payload, options };
}

function expectNothingSent() {
  expect(sendEmailMock).not.toHaveBeenCalled();
}

function expectNoWrites() {
  for (const method of [
    "insert",
    "update",
    "delete",
    "execute",
    "transaction",
  ] as const) {
    expect(db[method], method).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  env.serverEnv.VERCEL_ENV = "preview";
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", BASE);
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_comunicado_test_send");
  getCurrentUserProfileMock.mockResolvedValue(ADMIN);
  featureFlagGuardMock.mockResolvedValue(null);
  consumeActionRateLimitMock.mockResolvedValue(true);
  isSuppressedMock.mockResolvedValue(false);
  sendEmailMock.mockResolvedValue({
    data: { id: "email_1" },
    error: null,
    headers: null,
  });
  rowsByTable.clear();
  rowsByTable.set(comunicados, [DRAFT]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendComunicadoTestAction", () => {
  it("mails the working copy once, to the admin's own address, marked as a test", async () => {
    const result = await sendComunicadoTestAction(7);

    expect(result).toEqual({
      success: true,
      message: "Te enviamos la prueba a d•••@gmail.com.",
    });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const { payload, options } = sent();
    expect(payload.to).toBe("dennis@gmail.com");
    expect(payload.subject).toBe("[Prev] [Prueba] Cambio de horario de armado");
    expect(payload.from).toBe(COMUNICADOS_FROM_STAGING);
    expect(payload.replyTo).toBe("soporte@productoraglitter.com");
    expect(payload.html).toContain("¡Hola Dennis Guzmán!");
    expect(payload.html).toContain(`href="${BASE}/my_participations"`);
    expect(payload.html).toContain(
      "Este correo salió del entorno de prueba de Glitter.",
    );
    expect(payload.text).toContain(`tu reserva (${BASE}/my_participations)`);
    expect(payload.text).toContain(`Ver mi reserva: ${BASE}/my_participations`);
    expect(options.idempotencyKey).toMatch(
      /^comunicado-test:7:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expectNoWrites();
  });

  it("carries a real unsubscribe link and header for the admin, topic Anuncios", async () => {
    await sendComunicadoTestAction(7);
    const { payload } = sent();

    const footer = payload.text.match(/Darme de baja: (\S+)$/)?.[1];
    expect(footer).toMatch(new RegExp(`^${BASE}/email/unsubscribe\\?token=`));
    const token = decodeURIComponent(
      new URL(footer!).searchParams.get("token")!,
    );
    expect(token).not.toBe("preview");
    expect(verifyUnsubscribeToken(token)).toEqual({
      kind: "user",
      id: 42,
      topic: "announcements",
    });
    expect(payload.html).toContain(footer!.replaceAll("&", "&amp;"));
    expect(payload.headers["List-Unsubscribe"]).toBe(
      `<${BASE}/api/email/unsubscribe?token=${encodeURIComponent(token)}>`,
    );
    expect(payload.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
  });

  it("gives every click its own idempotency key", async () => {
    await sendComunicadoTestAction(7);
    await sendComunicadoTestAction(7);
    expect(sent(0).options.idempotencyKey).not.toBe(
      sent(1).options.idempotencyKey,
    );
  });

  it("keeps the staging marks out of production, and the test mark in", async () => {
    env.serverEnv.VERCEL_ENV = "production";
    await sendComunicadoTestAction(7);
    const { payload } = sent();
    expect(payload.subject).toBe("[Prueba] Cambio de horario de armado");
    expect(payload.from).toBe(COMUNICADOS_FROM);
    expect(payload.html).not.toContain("entorno de prueba");
  });

  it("says so in development, where nothing is mailed", async () => {
    env.serverEnv.VERCEL_ENV = "development";
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://localhost:3000");
    const result = await sendComunicadoTestAction(7);
    expect(result).toEqual({
      success: true,
      message:
        "En desarrollo no se envían correos: quedó registrado en la consola.",
    });
    expect(sent().payload.subject).toBe(
      "[Dev] [Prueba] Cambio de horario de armado",
    );
  });

  it("is refused past the rate limit, keyed to the admin, before reading anything", async () => {
    consumeActionRateLimitMock.mockResolvedValue(false);
    const result = await sendComunicadoTestAction(7);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Esperá unos minutos/);
    expect(consumeActionRateLimitMock).toHaveBeenCalledWith({
      key: "comunicado-test:42",
      limit: COMUNICADO_TEST_SEND_LIMIT,
      windowMs: COMUNICADO_TEST_SEND_WINDOW_MS,
    });
    expect(COMUNICADO_TEST_SEND_LIMIT).toBe(5);
    expect(COMUNICADO_TEST_SEND_WINDOW_MS).toBe(10 * 60_000);
    expect(db.select).not.toHaveBeenCalled();
    expectNothingSent();
  });

  it("fails closed when the rate limit cannot be read", async () => {
    consumeActionRateLimitMock.mockRejectedValue(new Error("db down"));
    const result = await sendComunicadoTestAction(7);
    expect(result.success).toBe(false);
    expectNothingSent();
  });

  it("is only for global admins with the flag on, checked first", async () => {
    getCurrentUserProfileMock.mockResolvedValue({
      ...ADMIN,
      role: "festival_admin",
    });
    expect(await sendComunicadoTestAction(7)).toEqual({
      success: false,
      message: "No autorizado.",
    });
    expect(featureFlagGuardMock).not.toHaveBeenCalled();

    getCurrentUserProfileMock.mockResolvedValue(ADMIN);
    featureFlagGuardMock.mockResolvedValue({
      success: false,
      message: "Esta funcionalidad no está disponible",
    });
    expect(await sendComunicadoTestAction(7)).toEqual({
      success: false,
      message: "Esta funcionalidad no está disponible",
    });
    expect(featureFlagGuardMock).toHaveBeenCalledWith("comunicados", ADMIN);
    expect(consumeActionRateLimitMock).not.toHaveBeenCalled();
    expectNothingSent();
  });

  it("refuses a sent comunicado, a missing one and a bad id", async () => {
    rowsByTable.set(comunicados, [{ ...DRAFT, status: "sent" }]);
    expect((await sendComunicadoTestAction(7)).message).toMatch(/ya se envió/);

    rowsByTable.set(comunicados, []);
    expect(await sendComunicadoTestAction(7)).toEqual({
      success: false,
      message: "No encontramos este comunicado.",
    });

    for (const id of ["7", 0, -1, 1.5, null]) {
      expect((await sendComunicadoTestAction(id)).success).toBe(false);
    }
    expectNothingSent();
  });

  it("tries a scheduled comunicado's working copy too", async () => {
    rowsByTable.set(comunicados, [{ ...DRAFT, status: "scheduled" }]);
    expect((await sendComunicadoTestAction(7)).success).toBe(true);
  });

  it("checks the working copy as a send would", async () => {
    rowsByTable.set(comunicados, [{ ...DRAFT, title: "  " }]);
    expect(await sendComunicadoTestAction(7)).toEqual({
      success: false,
      message: "Escribí un título.",
    });

    rowsByTable.set(comunicados, [{ ...DRAFT, actionPath: "//evil.example" }]);
    expect((await sendComunicadoTestAction(7)).message).toMatch(
      /^Pegá un enlace de Glitter/,
    );

    rowsByTable.set(comunicados, [{ ...DRAFT, essential: true }]);
    expect((await sendComunicadoTestAction(7)).message).toMatch(
      /por qué es esencial/,
    );
    expectNothingSent();
  });

  it("refuses outside development when the links would point nowhere", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://localhost:3000");
    expect(await sendComunicadoTestAction(7)).toEqual({
      success: false,
      message:
        "Falta configurar la dirección pública del sitio: los enlaces del correo no funcionarían.",
    });
    expectNothingSent();
  });

  it("does not promise a test to an address that is blocked or missing", async () => {
    isSuppressedMock.mockResolvedValue(true);
    expect((await sendComunicadoTestAction(7)).message).toMatch(/bloqueado/);

    isSuppressedMock.mockResolvedValue(false);
    getCurrentUserProfileMock.mockResolvedValue({ ...ADMIN, email: "" });
    expect((await sendComunicadoTestAction(7)).success).toBe(false);
    expectNothingSent();
  });

  it("adds the essential note for an essential draft to one festival", async () => {
    rowsByTable.set(comunicados, [
      {
        ...DRAFT,
        essential: true,
        essentialReason: "El armado se adelanta por la lluvia",
        audience: { festivals: [3], lists: [], people: [] },
      },
    ]);
    rowsByTable.set(festivals, [{ name: "Glitter Navidad 2026" }]);

    expect((await sendComunicadoTestAction(7)).success).toBe(true);
    expect(sent().payload.html).toContain(
      "Es un correo esencial sobre tu participación en Glitter Navidad 2026",
    );
  });

  it("reports a send Resend refused as a failure", async () => {
    sendEmailMock.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Invalid `to` field." },
      headers: null,
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendComunicadoTestAction(7)).toEqual({
      success: false,
      message:
        "No pudimos enviarte la prueba. Intentá de nuevo en unos minutos.",
    });
    // The error's type only: never the address.
    expect(JSON.stringify(errors.mock.calls)).not.toContain("dennis@gmail.com");
    errors.mockRestore();
  });

  it("never reaches the inbox, delivery or bulk code", () => {
    const sources = ["test-send.ts", "email.ts", "validate.ts"].map((file) =>
      readFileSync(path.join(__dirname, file), "utf8"),
    );
    for (const source of sources) {
      expect(source).not.toMatch(
        /from "@\/app\/lib\/notifications\/(notify|deliveries|bulk-email|push)/,
      );
      expect(source).not.toMatch(/\bnotif(y|ications)\s*\(/);
    }
  });
});
