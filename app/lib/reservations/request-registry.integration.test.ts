// @vitest-environment node

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import {
  claimRequest,
  completeRequest,
} from "@/app/lib/reservations/request-registry";
import * as schema from "@/db/schema";
import { reservationRequestRegistry, users } from "@/db/schema";

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

const poolA = testDatabaseUrl
  ? new Pool({ connectionString: testDatabaseUrl, max: 1 })
  : null;
const poolB = testDatabaseUrl
  ? new Pool({ connectionString: testDatabaseUrl, max: 1 })
  : null;
const dbA = poolA ? drizzle(poolA, { schema }) : null;
const dbB = poolB ? drizzle(poolB, { schema }) : null;
const describeDatabase = dbA && dbB ? describe : describe.skip;

const createdUserIds: number[] = [];
const createdRequestKeys: string[] = [];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describeDatabase("claimRequest concurrent duplicate insert", () => {
  afterEach(async () => {
    if (createdRequestKeys.length > 0) {
      for (const requestKey of createdRequestKeys) {
        await dbA!
          .delete(reservationRequestRegistry)
          .where(eq(reservationRequestRegistry.requestKey, requestKey));
      }
      createdRequestKeys.length = 0;
    }
    if (createdUserIds.length > 0) {
      for (const id of createdUserIds) {
        await dbA!.delete(users).where(eq(users.id, id));
      }
      createdUserIds.length = 0;
    }
  });

  afterAll(async () => {
    await poolA?.end();
    await poolB?.end();
  });

  it("replays completed result when a concurrent insert loses the race", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const requestKey = `44444444-4444-4444-8444-${suffix.slice(0, 12).padEnd(12, "0")}`;

    const [actor] = await dbA!
      .insert(users)
      .values({
        clerkId: `registry_race_${suffix}`,
        email: `registry-race-${suffix}@example.com`,
        status: "verified",
      })
      .returning({ id: users.id });
    createdUserIds.push(actor.id);
    createdRequestKeys.push(requestKey);

    const claimInput = {
      requestKey,
      operation: "adminConfirmReservation" as const,
      actorUserId: actor.id,
      scope: { reservationId: 100, partnerId: null },
    };

    let winnerInserted = false;
    let loserMayClaim = false;

    const claimA = dbA!.transaction(async (tx) => {
      const claim = await claimRequest(tx, claimInput);
      if (claim.kind === "claimed") {
        winnerInserted = true;
        while (!loserMayClaim) {
          await sleep(5);
        }
        await completeRequest(tx, requestKey, { reservationId: 100 });
      }
      return claim;
    });

    const claimB = dbB!.transaction(async (tx) => {
      while (!winnerInserted) {
        await sleep(5);
      }
      loserMayClaim = true;
      return claimRequest(tx, claimInput);
    });

    const [resultA, resultB] = await Promise.all([claimA, claimB]);

    expect(resultA.kind).toBe("claimed");
    expect(resultB).toEqual({
      kind: "replayed",
      resultIds: { reservationId: 100 },
    });
  });
});
