import { describe, expect, it } from "vitest";

import {
  notificationLogErrorExplanation,
  redactNotificationLogError,
} from "@/app/lib/notifications/admin-log-errors";

const push = { channel: "push", lane: "transactional" } as const;
const email = { channel: "email", lane: "transactional" } as const;
const bulk = { channel: "email", lane: "bulk" } as const;

function explain(
  code: string,
  context: Parameters<typeof notificationLogErrorExplanation>[1] = email,
) {
  return notificationLogErrorExplanation(code, context);
}

describe("notificationLogErrorExplanation", () => {
  // Every code the senders store today (see the module's header).
  const KNOWN: [string, typeof push | typeof email | typeof bulk][] = [
    ["push_400", push],
    ["push_401", push],
    ["push_403", push],
    ["push_404", push],
    ["push_408", push],
    ["push_410", push],
    ["push_413", push],
    ["push_429", push],
    ["push_500", push],
    ["push_503", push],
    ["push_422", push],
    ["push_network", push],
    ["push_timeout", push],
    ["endpoint_rejected", push],
    ["expired", push],
    ["no_device", push],
    ["no_notification", push],
    ["retracted", push],
    ["archived", push],
    ["read", push],
    ["not_visible", push],
    ["deleting", push],
    ["push_off", push],
    ["unconfigured", push],
    ["key_mismatch", push],
    ["revoked", email],
    ["no_recipient", email],
    ["suppressed", email],
    ["render_unavailable", email],
    ["resend:rate_limit_exceeded", email],
    ["resend:internal_server_error", email],
    ["resend:validation_error", email],
    ["resend:invalid_api_key", bulk],
    ["resend:daily_quota_exceeded", bulk],
    ["resend:monthly_quota_exceeded", email],
    ["resend:concurrent_idempotent_requests", bulk],
    ["resend:not_found", bulk],
    ["resend:item_rejected", bulk],
    ["resend:empty_response", bulk],
    ["timeout", bulk],
    ["outcome_unknown", bulk],
    ["render_failed", bulk],
    ["expired", bulk],
    ["invalid_address", bulk],
    ["not_eligible", bulk],
    ["staging", bulk],
    ["address_changed", bulk],
    ["unsubscribed", bulk],
    ["bounced", bulk],
    ["opted_out", bulk],
    ["reservation_missing", email],
    ["reservation_id_missing", email],
    ["rejection_recipient_missing", email],
    ["late_partner_recipient_missing", email],
    ["late_partner_owner_missing", email],
    ["late_partner_partner_missing", email],
    ["release_recipient_missing", email],
    ["release_owner_missing", email],
    ["extension_recipient_missing", email],
    ["enrollment_payload_missing", email],
    ["enrollment_context_missing", email],
    ["credit_payload_missing", email],
    ["credit_top_up_missing", email],
    ["credit_profile_missing", email],
    ["unsupported_kind:something", email],
    ["send_failed", email],
    ["Resend request timed out", email],
    ["profile_deleted", email],
    ["Failed query", email],
    ["Payload de notificación inválido", email],
  ];

  it.each(KNOWN)("explains %s", (code, context) => {
    expect(explain(code, context)).toMatch(/\S/);
  });

  it("reads a removed device as routine, never as a failure", () => {
    expect(explain("push_410", push)).toMatch(/^Es normal/);
    expect(explain("push_410", push)).toMatch(/Se quitó de la cuenta/);
    expect(explain("push_404", push)).toBe(explain("push_410", push));
  });

  it("says a rejected push is final and keeps the device", () => {
    for (const code of ["push_400", "push_403", "push_413", "push_422"]) {
      expect(explain(code, push)).toMatch(
        /no se reintenta y el dispositivo se conserva/,
      );
    }
    expect(explain("push_403", push)).toMatch(/VAPID/);
    expect(explain("push_413", push)).toMatch(/demasiado grande/);
    expect(explain("push_422", push)).toMatch(/código HTTP 422/);
  });

  it("says temporary push errors were retried until they ran out", () => {
    for (const code of [
      "push_500",
      "push_502",
      "push_408",
      "push_429",
      "push_network",
      "push_timeout",
    ]) {
      expect(explain(code, push)).toMatch(
        /Se reintenta solo; quedó como fallido/,
      );
    }
  });

  it("reads expired by channel: 48 hours for a push, 20 for bulk mail", () => {
    expect(explain("expired", push)).toMatch(/48 horas/);
    expect(explain("expired", bulk)).toMatch(/20 horas/);
  });

  it("tells a bulk quota failure is not retried on its own", () => {
    expect(explain("resend:daily_quota_exceeded", bulk)).toMatch(
      /cupo diario.*no se reintenta solo/,
    );
    expect(explain("resend:monthly_quota_exceeded", email)).toMatch(
      /cupo mensual.*Se reintenta solo/,
    );
  });

  it("reads an outbox's thrown Resend error by its name", () => {
    expect(
      explain("rate_limit_exceeded: Too many requests, slow down"),
    ).toMatch(/bajar el ritmo/);
    expect(explain("monthly_quota_exceeded: You reached it")).toMatch(
      /cupo mensual/,
    );
    // Not a Resend name: shown as stored.
    expect(explain("something: else")).toBeNull();
  });

  it("leaves unknown and free text to the stored value", () => {
    expect(explain("push_gone: 410", push)).toBeNull();
    expect(explain("resend 500")).toBeNull();
    expect(explain("No se encontró la sanción")).toBeNull();
    expect(explain("Error")).toBeNull();
    // Inherited object keys are not codes.
    expect(explain("constructor")).toBeNull();
    expect(explain("toString")).toBeNull();
  });
});

describe("redactNotificationLogError", () => {
  it("passes known codes through", () => {
    for (const code of [
      "push_410",
      "resend:rate_limit_exceeded",
      "late_partner_recipient_missing",
      "unsupported_kind:festival_participation_approved",
      "Resend request timed out",
    ]) {
      expect(redactNotificationLogError(code)).toBe(code);
    }
  });

  it("keeps only the head of a database error", () => {
    expect(
      redactNotificationLogError(
        'Failed query: update "users" set "email" = $1\nparams: lola@example.test',
      ),
    ).toBe("Failed query");
  });

  it("drops an invalid payload's details and JSON dumps", () => {
    expect(
      redactNotificationLogError(
        'Payload de notificación inválido: [{"path":["note"],"received":"motivo"}]',
      ),
    ).toBe("Payload de notificación inválido");
    expect(redactNotificationLogError('{"note":"motivo reservado"}')).toBe(
      "[detalle oculto]",
    );
  });

  it("masks endpoints, addresses and keys", () => {
    const text = redactNotificationLogError(
      "validation_error: Invalid `to` lola.perez+x@example.test at https://fcm.googleapis.com/fcm/send/abc123 with re_AbC123dEf456GhI789jKl012",
    );
    expect(text).toBe(
      "validation_error: Invalid `to` [correo] at [url] with [oculto]",
    );
  });
});
