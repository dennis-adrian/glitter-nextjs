// @vitest-environment node
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

/**
 * The comunicado renderer's pure parts (docs/IMPLEMENTATION-comunicados.md
 * D3, D7): how the pre-check's verdicts become the lane's lists, and one
 * person's payload. The SQL and the rendering run in
 * `delivery.integration.test.ts`.
 */

const env = vi.hoisted(() => ({ VERCEL_ENV: "production" as string }));

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ serverEnv: env }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/app/lib/comunicados/email", () => ({
  renderComunicadoEmail: vi.fn(),
}));

import {
  type ComunicadoPrecheck,
  comunicadoBatchEmail,
  comunicadoBatchRenderer,
  preparationSkeleton,
} from "@/app/lib/comunicados/delivery";
import type { ClaimedBulkRow } from "@/app/lib/notifications/bulk-email";

function row(id: number, overrides: Partial<ClaimedBulkRow> = {}) {
  return {
    id,
    userId: 100 + id,
    recipientEmail: `persona-${id}@example.test`,
    leaseOwner: "bulk-email:owner",
    ...overrides,
  } as ClaimedBulkRow;
}

function check(
  id: number,
  skip: string | null,
  overrides: Partial<ComunicadoPrecheck> = {},
): ComunicadoPrecheck {
  return {
    id,
    skip,
    overridden: false,
    displayName: null,
    firstName: "Ana",
    lastName: "Ilustra",
    ...overrides,
  };
}

const RENDERED = {
  from: "Productora Glitter <anuncios@productoraglitter.com>",
  replyTo: "soporte@productoraglitter.com",
  subject: "Cambio de horario de armado",
  html: "<p>Hola</p>",
  text: "Hola",
};

const HEADERS = {
  "List-Unsubscribe": "<https://glitter.test/api/email/unsubscribe?token=t>",
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
};

describe("preparationSkeleton", () => {
  it("fails a changed address, skips every other code, and renders the rest", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => row(id));
    const checks = [
      check(1, null),
      check(2, "address_changed"),
      check(3, "retracted"),
      check(4, "not_eligible"),
      check(5, "deleting"),
      check(6, "staging"),
      check(7, "suppressed"),
      check(8, "unsubscribed"),
      check(9, null, { overridden: true }),
    ];

    const { skipped, failed, toRender } = preparationSkeleton(rows, checks);

    expect(failed).toEqual([{ id: 2, code: "address_changed" }]);
    expect(skipped).toEqual([
      { id: 3, code: "retracted" },
      { id: 4, code: "not_eligible" },
      { id: 5, code: "deleting" },
      { id: 6, code: "staging" },
      { id: 7, code: "suppressed" },
      { id: 8, code: "unsubscribed" },
    ]);
    expect(toRender.map((r) => [r.id, r.userId, r.check])).toEqual([
      [1, 101, checks[0]],
      [9, 109, checks[8]],
    ]);
  });

  it("fails closed: a row the pre-check did not return is not eligible", () => {
    const { skipped, failed, toRender } = preparationSkeleton(
      [row(1), row(2)],
      [check(1, null), check(77, null)],
    );

    expect(skipped).toEqual([{ id: 2, code: "not_eligible" }]);
    expect(failed).toEqual([]);
    expect(toRender.map((r) => r.id)).toEqual([1]);
  });

  it("never renders a row with no person or no address to mail", () => {
    const { skipped, toRender } = preparationSkeleton(
      [row(1, { userId: null }), row(2, { recipientEmail: null })],
      [check(1, null), check(2, null)],
    );

    expect(skipped).toEqual([
      { id: 1, code: "not_eligible" },
      { id: 2, code: "not_eligible" },
    ]);
    expect(toRender).toEqual([]);
  });
});

describe("comunicadoBatchEmail", () => {
  it("carries the one-click headers, the reply address and both tags", () => {
    expect(
      comunicadoBatchEmail({
        to: "ana@example.test",
        rendered: RENDERED,
        headers: HEADERS,
        comunicadoId: 42,
      }),
    ).toEqual({
      ...RENDERED,
      to: ["ana@example.test"],
      headers: HEADERS,
      tags: [
        { name: "category", value: "comunicado" },
        { name: "comunicado_id", value: "42" },
      ],
    });
  });

  it("leaves out the headers for someone an essential send reached past their opt-out", () => {
    const email = comunicadoBatchEmail({
      to: "ana@example.test",
      rendered: RENDERED,
      headers: null,
      comunicadoId: 42,
    });

    expect(email).not.toHaveProperty("headers");
    expect(email.replyTo).toBe("soporte@productoraglitter.com");
    expect(email.tags).toEqual([
      { name: "category", value: "comunicado" },
      { name: "comunicado_id", value: "42" },
    ]);
  });
});

describe("comunicadoBatchRenderer.scope", () => {
  it("reads the environment when it is called, not when the module loads", () => {
    const dialect = new PgDialect();
    const paramsFor = (vercelEnv: string) => {
      env.VERCEL_ENV = vercelEnv;
      return dialect.sqlToQuery(comunicadoBatchRenderer.scope()).params;
    };

    expect(paramsFor("preview")).toEqual(["preview"]);
    expect(paramsFor("production")).toEqual(["production"]);
  });
});
