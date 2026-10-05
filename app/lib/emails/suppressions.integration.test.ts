// @vitest-environment node

import { createHmac } from "node:crypto";

import { eq, inArray, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as schema from "@/db/schema";
import {
  emailSuppressions,
  emailUnsubscribes,
  users,
  visitors,
} from "@/db/schema";

/**
 * Who bulk mail skips, end to end against a real database: the suppression
 * rules, Resend's webhook, the one-click endpoint and the unsubscribe page's
 * actions.
 */

vi.mock("server-only", () => ({}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function isSafeTestDatabase(url: string): boolean {
  try {
    const databaseName = decodeURIComponent(new URL(url).pathname.slice(1));
    return /(^|[_-])(test|ci)([_-]|$)/i.test(databaseName);
  } catch {
    return false;
  }
}

if (testDatabaseUrl && !isSafeTestDatabase(testDatabaseUrl)) {
  throw new Error(
    "TEST_DATABASE_URL must target a database whose name contains 'test' or 'ci'.",
  );
}

const pool = testDatabaseUrl
  ? new Pool({ connectionString: testDatabaseUrl })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

const WEBHOOK_SECRET =
  "whsec_" +
  Buffer.from("glitter integration webhook secret").toString("base64");

type Suppressions = typeof import("@/app/lib/emails/suppressions");
type Tokens = typeof import("@/app/lib/emails/unsubscribe-tokens");
type Actions = typeof import("@/app/lib/emails/unsubscribe-actions");
type WebhookRoute = typeof import("@/app/api/webhooks/resend/route");
type OneClickRoute = typeof import("@/app/api/email/unsubscribe/route");
let suppressions: Suppressions;
let tokens: Tokens;
let actions: Actions;
let webhook: WebhookRoute;
let oneClick: OneClickRoute;

/** Every address a test makes carries this, so cleanup finds them all. */
const MARK = "supp-it";
const created = { visitors: [] as number[], users: [] as number[] };

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function address(label: string) {
  return `${label}-${MARK}-${suffix()}@example.test`;
}

async function suppressionFor(email: string) {
  const [row] = await integrationDb!
    .select()
    .from(emailSuppressions)
    .where(eq(emailSuppressions.emailKey, email.trim().toLowerCase()));
  return row ?? null;
}

async function unsubscribedTopics(email: string) {
  const rows = await integrationDb!
    .select({ topic: emailUnsubscribes.topic })
    .from(emailUnsubscribes)
    .where(eq(emailUnsubscribes.emailKey, email.trim().toLowerCase()));
  return rows.map((row) => row.topic).sort();
}

async function createVisitor(email: string) {
  const [visitor] = await integrationDb!
    .insert(visitors)
    .values({
      email,
      firstName: "Ana",
      phoneNumber: "+59171234567",
      birthdate: new Date("2000-01-01T12:00:00Z"),
    })
    .returning();
  created.visitors.push(visitor!.id);
  return visitor!;
}

function signedWebhook(event: unknown, overrides: Record<string, string> = {}) {
  const payload = JSON.stringify(event);
  const id = `msg_${suffix()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");
  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
      ...overrides,
    },
    body: payload,
  });
}

/** A fixed point in time plus `minutes`, so tests choose the event order. */
const T0 = Date.parse("2026-10-04T12:00:00.000Z");
function at(minutes: number) {
  return new Date(T0 + minutes * 60_000).toISOString();
}

function emailEvent(
  type: string,
  to: string[],
  data: Record<string, unknown> = {},
  createdAt = new Date().toISOString(),
) {
  return {
    type,
    created_at: createdAt,
    data: {
      email_id: `em_${suffix()}`,
      from: "Equipo Glitter <equipo@productoraglitter.com>",
      to,
      subject: "Pre-registro abierto",
      created_at: new Date().toISOString(),
      ...data,
    },
  };
}

function exclusion(
  email: string,
  topic: "visitor_invitations" | "participant_invitations",
) {
  return integrationDb!
    .execute(
      sql`select ${suppressions.bulkMailExclusion(sql`${email}::text`, topic)} as excluded,
        ${suppressions.reachableByBulkMail(sql`${email}::text`, topic)} as reachable`,
    )
    .then(
      (result) =>
        result.rows[0] as { excluded: string | null; reachable: boolean },
    );
}

describeDatabase("bulk mail suppressions", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl;
    process.env.CLERK_SECRET_KEY ??= "sk_test_integration";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    // Read when env.ts is first imported, below.
    process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;

    suppressions = await import("@/app/lib/emails/suppressions");
    tokens = await import("@/app/lib/emails/unsubscribe-tokens");
    actions = await import("@/app/lib/emails/unsubscribe-actions");
    webhook = await import("@/app/api/webhooks/resend/route");
    oneClick = await import("@/app/api/email/unsubscribe/route");

    const result = await pool!.query<{ table: string | null }>(
      "select to_regclass('public.email_suppressions')::text as table",
    );
    if (!result.rows[0]?.table) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
      );
    }
  }, 60_000);

  afterEach(async () => {
    const db = integrationDb!;
    const pattern = `%-${MARK}-%`;
    await db
      .delete(emailSuppressions)
      .where(like(emailSuppressions.emailKey, pattern));
    await db
      .delete(emailUnsubscribes)
      .where(like(emailUnsubscribes.emailKey, pattern));
    const visitorIds = created.visitors.splice(0);
    if (visitorIds.length > 0) {
      await db.delete(visitors).where(inArray(visitors.id, visitorIds));
    }
    const userIds = created.users.splice(0);
    if (userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, userIds));
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe("recordSuppression", () => {
    it("keys by the normalized address and keeps the strongest reason", async () => {
      const email = address("Mixed.Case");
      const typed = `  ${email.toUpperCase()} `;

      await suppressions.recordSuppression({
        address: typed,
        reason: "bounce",
        resendEmailId: "em_1",
        detail: "NoEmail: gone",
      });
      expect(await suppressionFor(email)).toMatchObject({
        emailKey: email.toLowerCase(),
        reason: "bounce",
        resendEmailId: "em_1",
      });

      await suppressions.recordSuppression({
        address: email,
        reason: "complaint",
      });
      expect(await suppressionFor(email)).toMatchObject({
        reason: "complaint",
      });

      // A bounce delivered late must not erase the complaint.
      await suppressions.recordSuppression({
        address: email,
        reason: "bounce",
        resendEmailId: "em_late",
      });
      expect(await suppressionFor(email)).toMatchObject({
        reason: "complaint",
        resendEmailId: null,
      });

      const rows = await integrationDb!
        .select()
        .from(emailSuppressions)
        .where(eq(emailSuppressions.emailKey, email.toLowerCase()));
      expect(rows).toHaveLength(1);
    });

    describe("events arriving late or out of order", () => {
      const when = (minutes: number) => new Date(at(minutes));

      it("ignores a late copy of a bounce that a lift already cleared", async () => {
        const email = address("late-retry");
        await suppressions.recordSuppression({
          address: email,
          reason: "bounce",
          eventAt: when(0),
        });
        await suppressions.liftSuppression({
          address: email,
          reason: "bounce",
          eventAt: when(5),
        });
        await suppressions.recordSuppression({
          address: email,
          reason: "bounce",
          eventAt: when(0),
        });
        expect(await suppressions.isSuppressed(email)).toBe(false);
      });

      it("keeps a lift that arrives before the bounce it lifted", async () => {
        const email = address("lift-first");
        await suppressions.liftSuppression({
          address: email,
          reason: "bounce",
          eventAt: when(5),
        });
        await suppressions.recordSuppression({
          address: email,
          reason: "bounce",
          eventAt: when(0),
        });
        expect(await suppressions.isSuppressed(email)).toBe(false);
      });

      it("suppresses again on a bounce after the lift", async () => {
        const email = address("bounces-again");
        await suppressions.recordSuppression({
          address: email,
          reason: "bounce",
          eventAt: when(0),
        });
        await suppressions.liftSuppression({
          address: email,
          reason: "bounce",
          eventAt: when(5),
        });
        await suppressions.recordSuppression({
          address: email,
          reason: "bounce",
          resendEmailId: "em_new",
          eventAt: when(10),
        });
        expect(await suppressionFor(email)).toMatchObject({
          reason: "bounce",
          resendEmailId: "em_new",
          liftedAt: null,
        });
      });

      it("ignores a lift older than the newest suppression", async () => {
        const email = address("stale-lift");
        await suppressions.recordSuppression({
          address: email,
          reason: "bounce",
          eventAt: when(10),
        });
        await suppressions.liftSuppression({
          address: email,
          reason: "bounce",
          eventAt: when(5),
        });
        expect(await suppressions.isSuppressed(email)).toBe(true);
      });

      it("lets a complaint outrank a bounce whichever arrives first", async () => {
        const email = address("complaint-late");
        await suppressions.recordSuppression({
          address: email,
          reason: "bounce",
          eventAt: when(10),
        });
        await suppressions.recordSuppression({
          address: email,
          reason: "complaint",
          eventAt: when(5),
        });
        expect(await suppressionFor(email)).toMatchObject({
          reason: "complaint",
        });
      });
    });

    it("keeps long bounce messages to a sane length", async () => {
      const email = address("long");
      await suppressions.recordSuppression({
        address: email,
        reason: "bounce",
        detail: "x".repeat(5000),
      });
      expect((await suppressionFor(email))!.detail).toHaveLength(500);
    });

    it("refuses an unnormalized key even if written directly", async () => {
      await expect(
        integrationDb!
          .insert(emailSuppressions)
          .values({ emailKey: `Upper-${MARK}@example.test`, reason: "bounce" }),
      ).rejects.toThrow();
    });
  });

  describe("who bulk mail skips", () => {
    it("skips a bounced or complaining address for every topic, and an unsubscribe only for its topic", async () => {
      const bounced = address("bounced");
      const complained = address("complained");
      const unsubscribed = address("unsubscribed");
      const fine = address("fine");
      await suppressions.recordSuppression({
        address: bounced,
        reason: "bounce",
      });
      await suppressions.recordSuppression({
        address: complained,
        reason: "complaint",
      });
      await suppressions.unsubscribe(unsubscribed, "visitor_invitations");

      for (const topic of [
        "visitor_invitations",
        "participant_invitations",
      ] as const) {
        expect(await exclusion(bounced.toUpperCase(), topic)).toEqual({
          excluded: "bounced",
          reachable: false,
        });
        expect(await exclusion(complained, topic)).toEqual({
          excluded: "opted_out",
          reachable: false,
        });
        expect(await exclusion(fine, topic)).toEqual({
          excluded: null,
          reachable: true,
        });
      }
      expect(
        await exclusion(` ${unsubscribed} `, "visitor_invitations"),
      ).toEqual({
        excluded: "opted_out",
        reachable: false,
      });
      expect(await exclusion(unsubscribed, "participant_invitations")).toEqual({
        excluded: null,
        reachable: true,
      });
    });

    it("unsubscribes and resubscribes one topic, whatever the case", async () => {
      const email = address("toggle");
      await suppressions.unsubscribe(
        email.toUpperCase(),
        "participant_invitations",
      );
      await suppressions.unsubscribe(email, "participant_invitations");
      expect(await unsubscribedTopics(email)).toEqual([
        "participant_invitations",
      ]);
      expect(
        await suppressions.isUnsubscribed(email, "participant_invitations"),
      ).toBe(true);
      expect(
        await suppressions.isUnsubscribed(email, "visitor_invitations"),
      ).toBe(false);

      await suppressions.resubscribe(email, "participant_invitations");
      expect(await unsubscribedTopics(email)).toEqual([]);
    });

    it("skips every topic for someone unsubscribed from all bulk mail, and a one-topic resubscribe keeps it", async () => {
      const email = address("all-mail");
      await suppressions.unsubscribe(email, "all");

      for (const topic of [
        "visitor_invitations",
        "participant_invitations",
      ] as const) {
        expect(await exclusion(email, topic)).toEqual({
          excluded: "opted_out",
          reachable: false,
        });
        expect(await suppressions.isUnsubscribed(email, topic)).toBe(true);
      }

      // Asking for one topic back says nothing about the others.
      await suppressions.unsubscribe(email, "visitor_invitations");
      await suppressions.resubscribe(email, "visitor_invitations");
      expect(await unsubscribedTopics(email)).toEqual(["all"]);
      expect(await exclusion(email, "participant_invitations")).toEqual({
        excluded: "opted_out",
        reachable: false,
      });
    });
  });

  describe("who lifted a suppression", () => {
    const when = (minutes: number) => new Date(at(minutes));

    it("keeps the admin who unblocked it when Resend confirms, and forgets them if it is blocked again", async () => {
      const email = address("admin-lift");
      const [admin] = await integrationDb!
        .insert(users)
        .values({
          clerkId: `clerk-${suffix()}`,
          email: address("admin"),
          role: "admin",
          status: "verified",
        })
        .returning();
      created.users.push(admin!.id);

      await suppressions.recordSuppression({
        address: email,
        reason: "bounce",
        eventAt: when(0),
      });
      await suppressions.liftSuppression({
        address: email,
        reason: "bounce",
        eventAt: when(5),
        liftedByUserId: admin!.id,
      });
      expect(await suppressionFor(email)).toMatchObject({
        liftedByUserId: admin!.id,
      });

      // Resend's own suppression.removed for the same lift, a moment later.
      await suppressions.liftSuppression({
        address: email,
        reason: "bounce",
        eventAt: when(6),
      });
      expect(await suppressionFor(email)).toMatchObject({
        liftedByUserId: admin!.id,
      });

      await suppressions.recordSuppression({
        address: email,
        reason: "bounce",
        eventAt: when(10),
      });
      expect(await suppressionFor(email)).toMatchObject({
        liftedAt: null,
        liftedByUserId: null,
      });
    });
  });

  describe("Resend webhook", () => {
    it("records a permanent bounce and a complaint, and ignores a transient bounce", async () => {
      const permanent = address("permanent");
      const transient = address("transient");
      const complainer = address("complainer");

      const responses = await Promise.all([
        webhook.POST(
          signedWebhook(
            emailEvent("email.bounced", [permanent], {
              bounce: {
                type: "Permanent",
                subType: "NoEmail",
                message: "No such user",
              },
            }),
          ),
        ),
        webhook.POST(
          signedWebhook(
            emailEvent("email.bounced", [transient], {
              bounce: {
                type: "Transient",
                subType: "MailboxFull",
                message: "Full",
              },
            }),
          ),
        ),
        webhook.POST(
          signedWebhook(emailEvent("email.complained", [complainer])),
        ),
      ]);
      expect(responses.map((response) => response.status)).toEqual([
        200, 200, 200,
      ]);

      expect(await suppressionFor(permanent)).toMatchObject({
        reason: "bounce",
        detail: "NoEmail: No such user",
      });
      expect(await suppressionFor(transient)).toBeNull();
      expect(await suppressionFor(complainer)).toMatchObject({
        reason: "complaint",
      });
    });

    it("is safe to deliver twice, and follows a suppression lifted in Resend", async () => {
      const email = address("twice");
      const event = emailEvent(
        "email.suppressed",
        [email],
        {
          suppressed: {
            type: "OnAccountSuppressionList",
            reason: "previous_bounce",
          },
        },
        at(0),
      );
      expect((await webhook.POST(signedWebhook(event))).status).toBe(200);
      expect((await webhook.POST(signedWebhook(event))).status).toBe(200);
      expect(await suppressionFor(email)).toMatchObject({
        reason: "bounce",
        liftedAt: null,
      });

      const lifted = await webhook.POST(
        signedWebhook({
          type: "suppression.removed",
          created_at: at(5),
          data: { id: "s_1", email, origin: "bounce", created_at: at(5) },
        }),
      );
      expect(lifted.status).toBe(200);
      expect((await suppressionFor(email))!.liftedAt).not.toBeNull();
      expect(await suppressions.isSuppressed(email)).toBe(false);
      expect(await exclusion(email, "visitor_invitations")).toEqual({
        excluded: null,
        reachable: true,
      });

      // Resend retries the original event after the lift: it is older, so
      // the address stays mailable.
      expect((await webhook.POST(signedWebhook(event))).status).toBe(200);
      expect(await suppressions.isSuppressed(email)).toBe(false);
    });
    it("refuses an unsigned or tampered event, and records nothing", async () => {
      const email = address("forged");
      const event = emailEvent("email.complained", [email]);

      const unsigned = await webhook.POST(
        new Request("http://localhost/api/webhooks/resend", {
          method: "POST",
          body: JSON.stringify(event),
        }),
      );
      const wrongSignature = await webhook.POST(
        signedWebhook(event, {
          "svix-signature": "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        }),
      );
      const stale = await webhook.POST(
        signedWebhook(event, {
          "svix-timestamp": String(Math.floor(Date.now() / 1000) - 3600),
        }),
      );

      expect([unsigned.status, wrongSignature.status, stale.status]).toEqual([
        401, 401, 401,
      ]);
      expect(await suppressionFor(email)).toBeNull();
    });

    it("acknowledges events it has no use for", async () => {
      const email = address("delivered");
      const response = await webhook.POST(
        signedWebhook(emailEvent("email.delivered", [email])),
      );
      expect(response.status).toBe(200);
      expect(await suppressionFor(email)).toBeNull();
    });
  });

  describe("unsubscribe links", () => {
    function oneClickRequest(token: string, method = "POST") {
      return new Request(
        `http://localhost/api/email/unsubscribe?token=${encodeURIComponent(token)}`,
        {
          method,
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: method === "POST" ? "List-Unsubscribe=One-Click" : undefined,
        },
      );
    }

    it("unsubscribes a visitor in one click, by the address their row has now", async () => {
      const visitor = await createVisitor(address("OneClick"));
      const token = tokens.signUnsubscribeToken({
        kind: "visitor",
        id: visitor.id,
        topic: "visitor_invitations",
      });

      const { NextRequest } = await import("next/server");
      const response = await oneClick.POST(
        new NextRequest(oneClickRequest(token)),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(await unsubscribedTopics(visitor.email)).toEqual([
        "visitor_invitations",
      ]);
    });

    it("refuses a forged token without touching anyone", async () => {
      const visitor = await createVisitor(address("victim"));
      const { NextRequest } = await import("next/server");
      const forged = `${Buffer.from(
        JSON.stringify({ t: "visitor_invitations", r: "v", i: visitor.id }),
      ).toString("base64url")}.AAAA`;

      const response = await oneClick.POST(
        new NextRequest(oneClickRequest(forged)),
      );

      expect(response.status).toBe(400);
      expect(await unsubscribedTopics(visitor.email)).toEqual([]);
    });

    it("sends a browser that opens the header link to the page that asks first", async () => {
      const { NextRequest } = await import("next/server");
      const response = await oneClick.GET(
        new NextRequest(oneClickRequest("abc.def", "GET")),
      );
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        "http://localhost/email/unsubscribe?token=abc.def",
      );
    });

    it("lets the page unsubscribe a participant and undo it", async () => {
      const email = address("participant");
      const [user] = await integrationDb!
        .insert(users)
        .values({ clerkId: `clerk-${suffix()}`, email, status: "verified" })
        .returning();
      created.users.push(user!.id);
      const token = tokens.signUnsubscribeToken({
        kind: "user",
        id: user!.id,
        topic: "participant_invitations",
      });

      expect(await actions.confirmUnsubscribe(token)).toMatchObject({
        success: true,
      });
      expect(await unsubscribedTopics(email)).toEqual([
        "participant_invitations",
      ]);

      expect(await actions.undoUnsubscribe(token)).toMatchObject({
        success: true,
      });
      expect(await unsubscribedTopics(email)).toEqual([]);

      expect(await actions.confirmUnsubscribe("nope")).toMatchObject({
        success: false,
      });
    });

    it("lifts an all-mail opt-out only when the page showed it as such", async () => {
      const visitor = await createVisitor(address("all-page"));
      await suppressions.unsubscribe(visitor.email, "all");
      await suppressions.unsubscribe(visitor.email, "participant_invitations");
      const token = tokens.signUnsubscribeToken({
        kind: "visitor",
        id: visitor.id,
        topic: "visitor_invitations",
      });

      // The page reads "todos nuestros correos masivos" for this person.
      expect(await suppressions.isUnsubscribedFromAll(visitor.email)).toBe(
        true,
      );
      expect(await actions.undoUnsubscribe(token)).toMatchObject({
        success: true,
        message: "Volverás a recibir nuestros correos.",
      });
      // Their separate choice about participant mail stays.
      expect(await unsubscribedTopics(visitor.email)).toEqual([
        "participant_invitations",
      ]);
    });

    it("has nothing to do for a recipient that no longer exists", async () => {
      const token = tokens.signUnsubscribeToken({
        kind: "visitor",
        id: 2_000_000_000,
        topic: "visitor_invitations",
      });
      expect(await actions.confirmUnsubscribe(token)).toMatchObject({
        success: false,
      });
      const { NextRequest } = await import("next/server");
      const response = await oneClick.POST(
        new NextRequest(oneClickRequest(token)),
      );
      expect(response.status).toBe(200);
    });
  });
});
