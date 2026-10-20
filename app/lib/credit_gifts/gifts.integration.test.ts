// @vitest-environment node

import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as schema from "@/db/schema";
import {
  creditAccounts,
  creditLedgerEntries,
  emailSuppressions,
  notificationCampaignRecipients,
  notificationCampaigns,
  notificationDeliveries,
  notifications,
  pendingUserDeletions,
  users,
} from "@/db/schema";

vi.mock("server-only", () => ({}));
// Sending is mocked: these tests are about what gets written and when a send
// counts as done, never about reaching Resend.
const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/vendors/resend", () => ({ sendEmail: sendEmailMock }));
// The inbox queries resolve the viewer from Clerk; every test passes one in.
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function isSafeTestDatabase(url: string): boolean {
  try {
    return /(^|[_-])(test|ci)([_-]|$)/i.test(
      decodeURIComponent(new URL(url).pathname.slice(1)),
    );
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
  ? new Pool({ connectionString: testDatabaseUrl, max: 10 })
  : null;
const integrationDb = pool ? drizzle(pool, { schema }) : null;
const describeDatabase = integrationDb ? describe : describe.skip;

type GiftService = typeof import("@/app/lib/credit_gifts/service");
type CreditService = typeof import("@/app/lib/credits/service");
type Deliveries = typeof import("@/app/lib/notifications/deliveries");
type InboxQueries = typeof import("@/app/lib/notifications/queries");
type Notify = typeof import("@/app/lib/notifications/notify");
let gifts: GiftService;
let credits: CreditService;
let deliveries: Deliveries;
let inbox: InboxQueries;
let notifyModule: Notify;

const createdUserIds: number[] = [];
const createdEmails: string[] = [];

async function createUser(
  overrides: Partial<typeof users.$inferInsert> = {},
): Promise<{ id: number; email: string }> {
  const suffix = randomUUID();
  const email = `credit-gift-${suffix}@example.com`;
  const [user] = await integrationDb!
    .insert(users)
    .values({
      clerkId: `credit-gift-${suffix}`,
      email,
      displayName: "Ana Ilustra",
      role: "user",
      status: "verified",
      ...overrides,
    })
    .returning({ id: users.id, email: users.email });
  createdUserIds.push(user!.id);
  createdEmails.push(user!.email);
  return user!;
}

function giftInput(
  recipientIds: number[],
  overrides: Partial<Parameters<GiftService["createCreditGift"]>[0]> = {},
) {
  return {
    recipientIds,
    amountPerRecipient: 20,
    occasion: "thanks" as const,
    title: "Un regalo para agradecerte",
    message: "¡Gracias por ser parte de Glitter, {nombre}!",
    internalNote: "Cortesía para el sector B",
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

async function ledgerFor(userId: number) {
  return integrationDb!
    .select()
    .from(creditLedgerEntries)
    .where(eq(creditLedgerEntries.userId, userId));
}

async function balanceOf(userId: number) {
  const rows = await ledgerFor(userId);
  return rows.reduce((total, row) => total + Number(row.amount), 0);
}

async function notificationsFor(userId: number) {
  return integrationDb!
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId));
}

async function deliveriesFor(userId: number) {
  return integrationDb!
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.userId, userId));
}

describeDatabase("credit gifts", () => {
  beforeAll(async () => {
    process.env.POSTGRES_URL = testDatabaseUrl!;
    process.env.CLERK_SECRET_KEY ??= "integration-test";
    process.env.RESEND_API_KEY ??= "integration-test";
    process.env.UPLOADTHING_TOKEN ??= "integration-test";
    gifts = await import("@/app/lib/credit_gifts/service");
    credits = await import("@/app/lib/credits/service");
    deliveries = await import("@/app/lib/notifications/deliveries");
    inbox = await import("@/app/lib/notifications/queries");
    notifyModule = await import("@/app/lib/notifications/notify");

    try {
      await integrationDb!
        .select({ id: notifications.id })
        .from(notifications)
        .limit(1);
    } catch (error) {
      throw new Error(
        "TEST_DATABASE_URL is safe but unmigrated; apply Drizzle migrations first.",
        { cause: error },
      );
    }
  }, 60_000);

  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({
      data: { id: `re_${randomUUID()}` },
      error: null,
      headers: null,
    });
  });

  afterEach(async () => {
    const db = integrationDb!;
    if (createdUserIds.length > 0) {
      const campaignRows = await db
        .select({ id: notificationCampaignRecipients.campaignId })
        .from(notificationCampaignRecipients)
        .where(inArray(notificationCampaignRecipients.userId, createdUserIds));
      const createdCampaigns = await db
        .select({ id: notificationCampaigns.id })
        .from(notificationCampaigns)
        .where(inArray(notificationCampaigns.createdByUserId, createdUserIds));
      const campaignIds = [
        ...new Set([...campaignRows, ...createdCampaigns].map((row) => row.id)),
      ];
      // Recipients hold the ledger entries, so they go first.
      if (campaignIds.length > 0) {
        await db
          .delete(notificationCampaigns)
          .where(inArray(notificationCampaigns.id, campaignIds));
      }
      await db
        .delete(notifications)
        .where(inArray(notifications.userId, createdUserIds));
      const client = await pool!.connect();
      try {
        await client.query(
          "ALTER TABLE credit_ledger_entries DISABLE TRIGGER credit_ledger_entries_append_only",
        );
        // Reversals point at the entries they undo: delete them first.
        await client.query(
          `DELETE FROM credit_ledger_entries WHERE user_id = ANY($1::int[]) AND reverses_entry_id IS NOT NULL`,
          [createdUserIds],
        );
        await client.query(
          `DELETE FROM credit_ledger_entries WHERE user_id = ANY($1::int[])`,
          [createdUserIds],
        );
      } finally {
        await client.query(
          "ALTER TABLE credit_ledger_entries ENABLE TRIGGER credit_ledger_entries_append_only",
        );
        client.release();
      }
      await db
        .delete(creditAccounts)
        .where(inArray(creditAccounts.userId, createdUserIds));
      await db
        .delete(pendingUserDeletions)
        .where(inArray(pendingUserDeletions.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
      createdUserIds.length = 0;
    }
    if (createdEmails.length > 0) {
      await db.delete(emailSuppressions).where(
        inArray(
          emailSuppressions.emailKey,
          createdEmails.map((email) => email.toLowerCase()),
        ),
      );
      createdEmails.length = 0;
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("credits each eligible recipient once and records what they were told", async () => {
    const admin = await createUser({ role: "admin" });
    const ana = await createUser({ displayName: "Ana" });
    const bruno = await createUser({ displayName: "Bruno" });
    const pending = await createUser({ status: "pending" });
    const banned = await createUser({ status: "banned" });

    const created = await gifts.createCreditGift(
      giftInput([ana.id, bruno.id, pending.id, banned.id]),
      { id: admin.id },
    );
    expect(created).toMatchObject({
      ok: true,
      eligibleCount: 2,
      skippedCount: 2,
      created: true,
    });
    if (!created.ok) throw new Error("gift not created");

    const first = await gifts.processCreditGift(created.campaignId);
    expect(first).toMatchObject({ granted: 2, skipped: 0, completed: true });
    expect(first.deliveryIds).toHaveLength(2);

    // A second run, as the cron would make, finds nothing left to do.
    const second = await gifts.processCreditGift(created.campaignId);
    expect(second).toMatchObject({ granted: 0, completed: false });

    for (const user of [ana, bruno]) {
      const ledger = await ledgerFor(user.id);
      expect(ledger).toHaveLength(1);
      expect(ledger[0]).toMatchObject({ type: "admin_grant", amount: 20 });
      expect(ledger[0]!.metadata).toMatchObject({
        creditGiftId: String(created.campaignId),
        occasion: "thanks",
        reason: "Un regalo para agradecerte",
      });

      const [notice] = await notificationsFor(user.id);
      expect(notice).toMatchObject({
        kind: "credit_gift_received",
        category: "credits",
        title: "Recibiste 20 créditos de regalo",
        actionPath: "/my_credits",
      });
      expect((await deliveriesFor(user.id)).map((row) => row.status)).toEqual([
        "pending",
      ]);
    }
    const [anaNotice] = await notificationsFor(ana.id);
    expect(anaNotice!.body).toBe("¡Gracias por ser parte de Glitter, Ana!");

    for (const skipped of [pending, banned]) {
      expect(await ledgerFor(skipped.id)).toHaveLength(0);
      expect(await notificationsFor(skipped.id)).toHaveLength(0);
    }
    const skippedRows = await integrationDb!
      .select({
        userId: notificationCampaignRecipients.userId,
        reason: notificationCampaignRecipients.skippedReason,
      })
      .from(notificationCampaignRecipients)
      .where(
        and(
          eq(notificationCampaignRecipients.campaignId, created.campaignId),
          eq(notificationCampaignRecipients.status, "skipped"),
        ),
      );
    expect(new Map(skippedRows.map((row) => [row.userId, row.reason]))).toEqual(
      new Map([
        [pending.id, "Perfil no verificado"],
        [banned.id, "Cuenta suspendida"],
      ]),
    );

    // The sender hears once, in the admin inbox, without an email.
    const adminNotices = await notificationsFor(admin.id);
    expect(adminNotices).toHaveLength(1);
    expect(adminNotices[0]).toMatchObject({
      kind: "credit_gift_completed",
      category: "admin",
    });
    expect(await deliveriesFor(admin.id)).toHaveLength(0);
  });

  it("splits a gift between concurrent workers without a double grant", async () => {
    const admin = await createUser({ role: "admin" });
    const recipients = await Promise.all(
      Array.from({ length: 6 }, () => createUser()),
    );
    const created = await gifts.createCreditGift(
      giftInput(recipients.map((user) => user.id)),
      { id: admin.id },
    );
    if (!created.ok) throw new Error("gift not created");

    // The request's worker and the cron, at once.
    const runs = await Promise.all([
      gifts.processCreditGift(created.campaignId),
      gifts.processCreditGift(created.campaignId),
    ]);
    expect(runs[0]!.granted + runs[1]!.granted).toBe(6);
    for (const user of recipients) {
      expect(await ledgerFor(user.id)).toHaveLength(1);
      expect(await notificationsFor(user.id)).toHaveLength(1);
    }
    expect(await notificationsFor(admin.id)).toHaveLength(1);
  });

  it("re-checks eligibility when crediting, not only when saving", async () => {
    const admin = await createUser({ role: "admin" });
    const banned = await createUser();
    const deleting = await createUser();
    const created = await gifts.createCreditGift(
      giftInput([banned.id, deleting.id]),
      { id: admin.id },
    );
    if (!created.ok) throw new Error("gift not created");

    await integrationDb!
      .update(users)
      .set({ status: "banned" })
      .where(eq(users.id, banned.id));
    await integrationDb!.insert(pendingUserDeletions).values({
      userId: deleting.id,
      clerkId: `pending-${randomUUID()}`,
    });

    const result = await gifts.processCreditGift(created.campaignId);
    expect(result).toMatchObject({ granted: 0, skipped: 2, completed: true });
    expect(await ledgerFor(banned.id)).toHaveLength(0);
    expect(await ledgerFor(deleting.id)).toHaveLength(0);
  });

  it("refuses a large total unless the admin typed it", async () => {
    const admin = await createUser({ role: "admin" });
    const a = await createUser();
    const b = await createUser();

    const untyped = await gifts.createCreditGift(
      giftInput([a.id, b.id], { amountPerRecipient: 500 }),
      { id: admin.id },
    );
    expect(untyped).toEqual({ ok: false, code: "CONFIRMATION_MISMATCH" });

    const typed = await gifts.createCreditGift(
      giftInput([a.id, b.id], {
        amountPerRecipient: 500,
        confirmedTotal: 1000,
      }),
      { id: admin.id },
    );
    expect(typed).toMatchObject({ ok: true, eligibleCount: 2 });
  });

  it("treats a double submit as one gift", async () => {
    const admin = await createUser({ role: "admin" });
    const ana = await createUser();
    const input = giftInput([ana.id]);

    const first = await gifts.createCreditGift(input, { id: admin.id });
    const second = await gifts.createCreditGift(input, { id: admin.id });
    if (!first.ok || !second.ok) throw new Error("gift not created");
    expect(second.campaignId).toBe(first.campaignId);
    expect(second.created).toBe(false);
  });

  it("revokes into a negative balance, says so, and cancels the banner", async () => {
    const admin = await createUser({ role: "admin" });
    const ana = await createUser();
    const created = await gifts.createCreditGift(giftInput([ana.id]), {
      id: admin.id,
    });
    if (!created.ok) throw new Error("gift not created");
    await gifts.processCreditGift(created.campaignId);

    // Ana spends part of it: here, an admin deduction stands in for a spend.
    const deduction = await credits.adjustCreditAccount({
      userId: ana.id,
      amount: -15,
      reason: "",
      internalNote: "integration fixture",
      idempotencyKey: randomUUID(),
    });
    expect(deduction.ok).toBe(true);

    const revoked = await gifts.revokeCreditGift({
      campaignId: created.campaignId,
      actorId: admin.id,
    });
    expect(revoked).toMatchObject({ revoked: 1, negative: 1, failed: 0 });
    expect(await balanceOf(ana.id)).toBe(-15);

    const notices = await notificationsFor(ana.id);
    const gift = notices.find((row) => row.kind === "credit_gift_received");
    const revokedNotice = notices.find(
      (row) => row.kind === "credit_gift_revoked",
    );
    expect(gift!.celebratedAt).not.toBeNull();
    expect(revokedNotice!.data).toMatchObject({ debtAmount: 15, amount: 20 });
    expect(revokedNotice!.body).toContain("saldo pendiente de 15 créditos");

    // Nothing is left to revoke, so a second click changes nothing.
    const again = await gifts.revokeCreditGift({
      campaignId: created.campaignId,
      actorId: admin.id,
    });
    expect(again).toMatchObject({ revoked: 0, failed: 0 });
    expect(await balanceOf(ana.id)).toBe(-15);
  });

  it("re-sends the notice without crediting again", async () => {
    const admin = await createUser({ role: "admin" });
    const ana = await createUser();
    const created = await gifts.createCreditGift(giftInput([ana.id]), {
      id: admin.id,
    });
    if (!created.ok) throw new Error("gift not created");
    await gifts.processCreditGift(created.campaignId);
    const [original] = await deliveriesFor(ana.id);

    // While the first email is still queued, a re-send would deliver twice.
    expect(
      await gifts.resendCreditGiftNotification({
        campaignId: created.campaignId,
        userId: ana.id,
        actorId: admin.id,
      }),
    ).toEqual({ ok: false, code: "EMAIL_PENDING" });

    await integrationDb!
      .update(notificationDeliveries)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(notificationDeliveries.id, original!.id));
    const resent = await gifts.resendCreditGiftNotification({
      campaignId: created.campaignId,
      userId: ana.id,
      actorId: admin.id,
    });
    expect(resent.ok).toBe(true);

    const rows = await deliveriesFor(ana.id);
    expect(rows).toHaveLength(2);
    const copy = rows.find((row) => row.id !== original!.id)!;
    expect(copy).toMatchObject({
      resendOfDeliveryId: original!.id,
      requestedByUserId: admin.id,
      templateKey: "credit_gift_received",
    });
    expect(copy.payload).toEqual(original!.payload);
    expect(await ledgerFor(ana.id)).toHaveLength(1);
  });

  it("sends, skips a blocked address, and retries a rejected send", async () => {
    const admin = await createUser({ role: "admin" });
    const ok = await createUser();
    const blocked = await createUser();
    const rejected = await createUser();
    await integrationDb!.insert(emailSuppressions).values({
      emailKey: blocked.email.toLowerCase(),
      reason: "bounce",
    });
    const created = await gifts.createCreditGift(
      giftInput([ok.id, blocked.id, rejected.id]),
      { id: admin.id },
    );
    if (!created.ok) throw new Error("gift not created");
    await gifts.processCreditGift(created.campaignId);

    sendEmailMock.mockImplementation(async (payload: { to: string[] }) =>
      payload.to[0] === rejected.email
        ? {
            data: null,
            error: {
              name: "rate_limit_exceeded",
              message: "Too many requests",
              statusCode: 429,
            },
            headers: null,
          }
        : { data: { id: "re_sent" }, error: null, headers: null },
    );

    const [okDelivery] = await deliveriesFor(ok.id);
    const [blockedDelivery] = await deliveriesFor(blocked.id);
    const [rejectedDelivery] = await deliveriesFor(rejected.id);
    await deliveries.sendNotificationDeliveries(
      [okDelivery!.id, blockedDelivery!.id, rejectedDelivery!.id],
      30_000,
    );

    const [sent] = await deliveriesFor(ok.id);
    expect(sent).toMatchObject({
      status: "sent",
      providerMessageId: "re_sent",
    });
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [ok.email],
        subject: "Recibiste 20 créditos de regalo",
        from: "Productora Glitter <creditos@productoraglitter.com>",
      }),
      { idempotencyKey: `notification-delivery-${okDelivery!.id}` },
    );

    const [skipped] = await deliveriesFor(blocked.id);
    expect(skipped).toMatchObject({
      status: "skipped",
      lastError: "suppressed",
    });
    expect(sendEmailMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: [blocked.email] }),
      expect.anything(),
    );

    const [retry] = await deliveriesFor(rejected.id);
    expect(retry).toMatchObject({
      status: "pending",
      attempts: 1,
      lastError: "resend:rate_limit_exceeded",
    });
    expect(retry!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  }, 30_000);

  it("notifies a person once per dedupe key", async () => {
    const ana = await createUser();
    const data = {
      campaignId: 1,
      name: "Ana",
      amount: 5,
      title: "Hola",
      message: "Hola Ana",
    };
    const [first, second] = await integrationDb!.transaction(async (tx) => [
      await notifyModule.notify(tx, {
        userId: ana.id,
        kind: "credit_gift_received",
        data,
        dedupeKey: "dedupe-test",
        email: ana.email,
      }),
      await notifyModule.notify(tx, {
        userId: ana.id,
        kind: "credit_gift_received",
        data,
        dedupeKey: "dedupe-test",
        email: ana.email,
      }),
    ]);
    expect(first!.created).toBe(true);
    expect(second).toMatchObject({
      created: false,
      notificationId: first!.notificationId,
      deliveryIds: [],
    });
    expect(await deliveriesFor(ana.id)).toHaveLength(1);
  });

  it("shows a viewer their own recent items, and admin mail to admins only", async () => {
    const participant = await createUser();
    const admin = await createUser({ role: "admin" });
    const old = new Date(Date.now() - 200 * 86_400_000);
    await integrationDb!.insert(notifications).values([
      {
        userId: participant.id,
        kind: "credit_gift_received",
        category: "credits",
        title: "Nueva",
        body: "Nueva",
        dedupeKey: "inbox-new",
      },
      {
        userId: participant.id,
        kind: "credit_gift_received",
        category: "credits",
        title: "Vieja",
        body: "Vieja",
        dedupeKey: "inbox-old",
        createdAt: old,
      },
      {
        userId: participant.id,
        kind: "credit_gift_completed",
        category: "admin",
        title: "Admin",
        body: "Admin",
        dedupeKey: "inbox-admin-stale",
      },
      {
        userId: admin.id,
        kind: "credit_gift_completed",
        category: "admin",
        title: "Admin",
        body: "Admin",
        dedupeKey: "inbox-admin",
      },
    ]);

    const participantPage = await inbox.fetchInboxPage({
      id: participant.id,
      role: "user",
    });
    // Past retention and admin-only items both stay out of view.
    expect(participantPage.items.map((item) => item.title)).toEqual(["Nueva"]);
    expect(participantPage.unreadCount).toBe(1);

    const adminPage = await inbox.fetchInboxPage(
      { id: admin.id, role: "admin" },
      { filter: "admin" },
    );
    expect(adminPage.items.map((item) => item.title)).toEqual(["Admin"]);

    // Someone else's id is not readable.
    const [foreign] = await notificationsFor(admin.id);
    expect(
      await inbox.fetchNotificationForViewer(
        { id: participant.id, role: "user" },
        foreign!.id,
      ),
    ).toBeNull();
  });

  it("adds up uncelebrated gifts into one banner", async () => {
    const admin = await createUser({ role: "admin" });
    const ana = await createUser();
    for (const amount of [20, 5]) {
      const created = await gifts.createCreditGift(
        giftInput([ana.id], { amountPerRecipient: amount }),
        { id: admin.id },
      );
      if (!created.ok) throw new Error("gift not created");
      await gifts.processCreditGift(created.campaignId);
    }

    const pending = await inbox.fetchPendingGiftCelebration(ana.id);
    expect(pending?.totalCredits).toBe(25);
    expect(pending?.notificationIds).toHaveLength(2);

    await integrationDb!
      .update(notifications)
      .set({ celebratedAt: new Date() })
      .where(inArray(notifications.id, pending!.notificationIds));
    expect(await inbox.fetchPendingGiftCelebration(ana.id)).toBeNull();
  });

  it("won't re-send to an address that bounced", async () => {
    const admin = await createUser({ role: "admin" });
    const ana = await createUser();
    const created = await gifts.createCreditGift(giftInput([ana.id]), {
      id: admin.id,
    });
    if (!created.ok) throw new Error("gift not created");
    await gifts.processCreditGift(created.campaignId);
    await integrationDb!
      .update(notificationDeliveries)
      .set({ status: "skipped", lastError: "suppressed" })
      .where(eq(notificationDeliveries.userId, ana.id));
    await integrationDb!.insert(emailSuppressions).values({
      emailKey: ana.email.toLowerCase(),
      reason: "bounce",
    });

    expect(
      await gifts.resendCreditGiftNotification({
        campaignId: created.campaignId,
        userId: ana.id,
        actorId: admin.id,
      }),
    ).toEqual({ ok: false, code: "SUPPRESSED" });
    expect(await deliveriesFor(ana.id)).toHaveLength(1);
  });

  it("refuses a reused key whose gift details changed", async () => {
    const admin = await createUser({ role: "admin" });
    const ana = await createUser();
    const input = giftInput([ana.id]);
    const first = await gifts.createCreditGift(input, { id: admin.id });
    expect(first.ok).toBe(true);

    // The response was lost, the admin lowered the amount and sent again.
    expect(
      await gifts.createCreditGift(
        { ...input, amountPerRecipient: 5 },
        { id: admin.id },
      ),
    ).toEqual({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
  });

  it("keeps a gift's grant from being reverted outside the gift", async () => {
    const admin = await createUser({ role: "admin" });
    const ana = await createUser();
    const created = await gifts.createCreditGift(giftInput([ana.id]), {
      id: admin.id,
    });
    if (!created.ok) throw new Error("gift not created");
    await gifts.processCreditGift(created.campaignId);
    const [grant] = await ledgerFor(ana.id);

    const reverted = await credits.adjustCreditAccount({
      userId: ana.id,
      amount: -20,
      reason: "Reversión",
      idempotencyKey: randomUUID(),
      reversesEntryId: grant!.id,
    });
    expect(reverted).toEqual({ ok: false, code: "ENTRY_NOT_REVERTIBLE" });
    expect(await balanceOf(ana.id)).toBe(20);
  });

  it("revoking cancels a gift email that has not gone out yet", async () => {
    const admin = await createUser({ role: "admin" });
    const ana = await createUser();
    const created = await gifts.createCreditGift(giftInput([ana.id]), {
      id: admin.id,
    });
    if (!created.ok) throw new Error("gift not created");
    await gifts.processCreditGift(created.campaignId);

    await gifts.revokeCreditGift({
      campaignId: created.campaignId,
      userIds: [ana.id],
      actorId: admin.id,
    });

    const rows = await deliveriesFor(ana.id);
    const received = rows.find(
      (row) => row.templateKey === "credit_gift_received",
    );
    const revoked = rows.find(
      (row) => row.templateKey === "credit_gift_revoked",
    );
    expect(received).toMatchObject({ status: "skipped", lastError: "revoked" });
    expect(revoked).toMatchObject({ status: "pending" });
  });

  it("revoking everyone mid-send stops it for whoever was still pending", async () => {
    const admin = await createUser({ role: "admin" });
    const recipients = await Promise.all([createUser(), createUser()]);
    const created = await gifts.createCreditGift(
      giftInput(recipients.map((user) => user.id)),
      { id: admin.id },
    );
    if (!created.ok) throw new Error("gift not created");

    // The worker has not reached anyone yet when the admin takes it back.
    const result = await gifts.revokeCreditGift({
      campaignId: created.campaignId,
      actorId: admin.id,
    });
    expect(result).toMatchObject({ revoked: 0, cancelled: 2, failed: 0 });

    const later = await gifts.processCreditGift(created.campaignId);
    expect(later.granted).toBe(0);
    for (const user of recipients) {
      expect(await ledgerFor(user.id)).toHaveLength(0);
      expect(await notificationsFor(user.id)).toHaveLength(0);
    }
    const [campaign] = await integrationDb!
      .select({ status: notificationCampaigns.status })
      .from(notificationCampaigns)
      .where(eq(notificationCampaigns.id, created.campaignId));
    expect(campaign!.status).toBe("completed");

    // The sender hears it was withdrawn, not "Regalo enviado".
    const [summary] = await notificationsFor(admin.id);
    expect(summary).toMatchObject({ kind: "credit_gift_completed" });
    expect(summary!.title).toBe(
      "Regalo retirado: «Un regalo para agradecerte»",
    );
  });

  it("never sends a gift email whose gift was revoked while it was in flight", async () => {
    const admin = await createUser({ role: "admin" });
    const ana = await createUser();
    const created = await gifts.createCreditGift(giftInput([ana.id]), {
      id: admin.id,
    });
    if (!created.ok) throw new Error("gift not created");
    await gifts.processCreditGift(created.campaignId);
    const [received] = await deliveriesFor(ana.id);

    // The drain had claimed it when the revoke ran, so the revoke left it
    // alone; the attempt then failed and put it back in the queue.
    await integrationDb!
      .update(notificationDeliveries)
      .set({ status: "processing", leaseOwner: "elsewhere" })
      .where(eq(notificationDeliveries.id, received!.id));
    await gifts.revokeCreditGift({
      campaignId: created.campaignId,
      userIds: [ana.id],
      actorId: admin.id,
    });
    await integrationDb!
      .update(notificationDeliveries)
      .set({ status: "pending", leaseOwner: null })
      .where(eq(notificationDeliveries.id, received!.id));

    await deliveries.sendNotificationDeliveries([received!.id], 30_000);
    const [after] = await integrationDb!
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.id, received!.id));
    expect(after).toMatchObject({ status: "skipped", lastError: "revoked" });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("pages through items that share a timestamp without skipping any", async () => {
    const ana = await createUser();
    // One transaction: every row gets the same now(), to the microsecond.
    await integrationDb!.transaction(async (tx) => {
      for (const n of [1, 2, 3]) {
        await tx.insert(notifications).values({
          userId: ana.id,
          kind: "credit_gift_received",
          category: "credits",
          title: `Item ${n}`,
          body: "",
          dedupeKey: `same-tx-${n}`,
        });
      }
    });
    const viewer = { id: ana.id, role: "user" as const };

    const first = await inbox.fetchInboxPage(viewer, { limit: 2 });
    const second = await inbox.fetchInboxPage(viewer, {
      limit: 2,
      before: first.nextCursor,
    });
    const titles = [...first.items, ...second.items].map((item) => item.title);
    expect(titles.sort()).toEqual(["Item 1", "Item 2", "Item 3"]);
    expect(second.nextCursor).toBeNull();
  });
});
