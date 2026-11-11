import { describe, expect, it } from "vitest";

import { describeNotificationLogError } from "@/app/lib/notifications/admin-log-errors";

describe("describeNotificationLogError", () => {
  it("reads a push service rejection, and says it is not retried", () => {
    const reading = describeNotificationLogError("push_400", "push");
    expect(reading?.summary).toBe("El servicio push rechazó el aviso (400).");
    expect(reading?.hint).toMatch(/No se reintenta/);
    expect(reading?.hint).toMatch(/dispositivo se conserva/);
  });

  it("reads a 400 with Apple's reason as a 400, plus what Apple said", () => {
    const plain = describeNotificationLogError("push_400", "push");
    const reading = describeNotificationLogError(
      "push_400:BadDeviceToken",
      "push",
    );
    expect(reading?.summary).toBe(plain?.summary);
    expect(reading?.hint).toBe(plain?.hint);
    expect(reading?.detail).toMatch(/BadDeviceToken/);
    expect(reading?.detail).toMatch(/desactiva y vuelve a activar/);
    expect(plain?.detail).toBeUndefined();
  });

  it("points a server-side Apple reason at the server, not the device", () => {
    for (const reason of ["BadExpirationDate", "BadTopic"]) {
      expect(
        describeNotificationLogError(`push_400:${reason}`, "push")?.detail,
      ).toMatch(/problema del servidor/);
    }
    const jwt = describeNotificationLogError("push_403:BadJwtToken", "push");
    expect(jwt?.summary).toBe(
      describeNotificationLogError("push_403", "push")?.summary,
    );
    expect(jwt?.detail).toMatch(/VAPID_SUBJECT/);
    expect(
      describeNotificationLogError("push_403:ExpiredProviderToken", "push")
        ?.detail,
    ).toMatch(/reloj/);
    expect(
      describeNotificationLogError("push_410:Unregistered", "push")?.summary,
    ).toMatch(/ya no recibe avisos/);
    expect(
      describeNotificationLogError("push_429:TooManyRequests", "push")?.detail,
    ).toMatch(/demasiados avisos/);
  });

  it("still reads the status when the reason is one we do not know", () => {
    const reading = describeNotificationLogError(
      "push_400:SomethingNew",
      "push",
    );
    expect(reading?.summary).toBe("El servicio push rechazó el aviso (400).");
    expect(reading?.detail).toBeUndefined();
    // Inherited object keys are not reasons.
    expect(
      describeNotificationLogError("push_400:constructor", "push")?.detail,
    ).toBeUndefined();
  });

  it("gives no reading to a suffix that is not a reason", () => {
    expect(
      describeNotificationLogError("push_400:Bad Device", "push"),
    ).toBeNull();
    expect(describeNotificationLogError("push_400:", "push")).toBeNull();
    expect(
      describeNotificationLogError("push_400:BadDeviceToken", "email"),
    ).toBeNull();
  });

  it("reads a dropped subscription as the device being gone", () => {
    for (const code of ["push_404", "push_410"]) {
      expect(describeNotificationLogError(code, "push")?.summary).toMatch(
        /ya no recibe avisos/,
      );
    }
  });

  it("tells a signature problem and a temporary failure apart", () => {
    expect(describeNotificationLogError("push_403", "push")?.hint).toMatch(
      /VAPID/,
    );
    expect(describeNotificationLogError("push_503", "push")?.summary).toBe(
      "Falla temporal del servicio push (503).",
    );
    expect(describeNotificationLogError("push_timeout", "push")?.hint).toMatch(
      /reintentó/,
    );
    // Any other 4xx still gets a reading, with its status.
    expect(describeNotificationLogError("push_418", "push")?.summary).toBe(
      "El servicio push rechazó el aviso (418).",
    );
  });

  it("reads push skip reasons", () => {
    expect(describeNotificationLogError("read", "push")?.summary).toMatch(
      /ya la había leído/,
    );
    expect(describeNotificationLogError("push_off", "push")).not.toBeNull();
  });

  it("reads a code by its channel: expired means different things", () => {
    expect(describeNotificationLogError("expired", "push")?.summary).not.toBe(
      describeNotificationLogError("expired", "email")?.summary,
    );
    expect(describeNotificationLogError("push_400", "email")).toBeNull();
    expect(describeNotificationLogError("suppressed", "push")).toBeNull();
  });

  it("reads email codes, including any Resend refusal", () => {
    expect(describeNotificationLogError("suppressed", "email")?.hint).toBe(
      "Se ve en Correos bloqueados.",
    );
    expect(
      describeNotificationLogError("resend:invalid_api_key", "email")?.summary,
    ).toBe("Problema de configuración de Resend.");
    expect(
      describeNotificationLogError("resend:something_new", "email")?.summary,
    ).toBe("Resend rechazó el envío.");
    expect(describeNotificationLogError("retracted", "email")).not.toBeNull();
  });

  it("leaves free-form outbox messages to be shown as stored", () => {
    expect(
      describeNotificationLogError("Error: connect ECONNREFUSED", "email"),
    ).toBeNull();
    expect(describeNotificationLogError("whatever", "in_app")).toBeNull();
  });
});
