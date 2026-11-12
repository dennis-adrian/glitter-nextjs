// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findStands: vi.fn(),
  findProfileSubcategories: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  db: {
    query: {
      stands: { findMany: mocks.findStands },
      profileSubcategories: { findMany: mocks.findProfileSubcategories },
    },
  },
}));

import { GET, OPTIONS } from "./route";

const NOW = new Date("2026-11-12T12:00:00Z");
const FUTURE = new Date("2026-11-13T12:00:00Z");

function participant(id: number, userId: number) {
  return {
    id,
    user: {
      id: userId,
      imageUrl: `https://img.test/${userId}.png`,
      displayName: `Persona ${userId}`,
      category: "illustration",
      userSocials: [{ type: "instagram", username: `persona${userId}` }],
    },
  };
}

function stand(
  id: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    label: "A",
    standNumber: id,
    status: "available",
    standCategory: "illustration",
    reservations: [],
    reservationMembers: [],
    ...overrides,
  };
}

function get(festivalId: string, origin?: string) {
  return GET(
    new NextRequest(`https://glitter.test/api/festivals/${festivalId}/stands`, {
      headers: origin ? { origin } : {},
    }),
    { params: Promise.resolve({ festivalId }) },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mocks.findStands.mockReset().mockResolvedValue([]);
  mocks.findProfileSubcategories.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/festivals/[festivalId]/stands", () => {
  it("sends each stand's status and category, and each participant's subcategory labels", async () => {
    mocks.findStands.mockResolvedValue([
      stand(1, {
        status: "confirmed",
        reservations: [
          { id: 10, revealAt: null, participants: [participant(100, 7)] },
        ],
      }),
      stand(2, { status: "disabled", standCategory: "gastronomy" }),
    ]);
    mocks.findProfileSubcategories.mockResolvedValue([
      { profileId: 7, subcategory: { label: "Stickers" } },
      { profileId: 7, subcategory: { label: "Prints" } },
    ]);

    const response = await get("3");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.stands).toEqual([
      {
        standId: 1,
        standLabel: "A",
        standNumber: 1,
        standDisplayLabel: "A1",
        status: "confirmed",
        standCategory: "illustration",
        revealAt: null,
        participants: [
          {
            participantId: 100,
            imageUrl: "https://img.test/7.png",
            displayName: "Persona 7",
            category: "illustration",
            subcategories: ["Stickers", "Prints"],
            socials: [{ type: "instagram", username: "persona7" }],
          },
        ],
      },
      {
        standId: 2,
        standLabel: "A",
        standNumber: 2,
        standDisplayLabel: "A2",
        status: "disabled",
        standCategory: "gastronomy",
        revealAt: null,
        participants: [],
      },
    ]);
  });

  it("withholds a hidden reservation's participants, and does not look up their subcategories", async () => {
    mocks.findStands.mockResolvedValue([
      stand(1, {
        status: "reserved",
        reservations: [
          { id: 10, revealAt: FUTURE, participants: [participant(100, 7)] },
        ],
      }),
    ]);

    const body = await (await get("3")).json();

    expect(body.stands[0]).toMatchObject({
      status: "reserved",
      standCategory: "illustration",
      revealAt: FUTURE.toISOString(),
      participants: [],
    });
    expect(mocks.findProfileSubcategories).not.toHaveBeenCalled();
  });

  it("shows the participants once revealAt has passed", async () => {
    mocks.findStands.mockResolvedValue([
      stand(1, {
        reservations: [
          {
            id: 10,
            revealAt: new Date("2026-11-12T11:59:00Z"),
            participants: [participant(100, 7)],
          },
        ],
      }),
    ]);

    const body = await (await get("3")).json();

    expect(body.stands[0].participants).toHaveLength(1);
    expect(body.stands[0].participants[0].subcategories).toEqual([]);
  });

  it.each([
    "http://localhost:8080",
    "http://localhost:5273",
    "https://game.glitter.com.bo",
  ])("allows %s and caches the answer per origin", async (origin) => {
    const response = await get("3", origin);

    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("vary")).toBe("Origin");
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=300",
    );
  });

  it("does not let a cached hidden snapshot outlive the reveal", async () => {
    const hiddenStand = (revealAt: Date) =>
      stand(1, {
        status: "reserved",
        reservations: [
          { id: 10, revealAt, participants: [participant(100, 7)] },
        ],
      });

    mocks.findStands.mockResolvedValue([hiddenStand(FUTURE)]);
    expect((await get("3")).headers.get("cache-control")).toBe(
      "public, s-maxage=60",
    );

    mocks.findStands.mockResolvedValue([
      hiddenStand(new Date("2026-11-12T12:00:20Z")),
    ]);
    expect((await get("3")).headers.get("cache-control")).toBe(
      "public, s-maxage=20",
    );

    mocks.findStands.mockResolvedValue([
      hiddenStand(new Date("2026-11-12T12:00:00.500Z")),
    ]);
    expect((await get("3")).headers.get("cache-control")).toBe("no-store");
  });

  it("does not allow an unknown origin", async () => {
    const response = await get("3", "https://evil.test");

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("vary")).toBe("Origin");
  });

  it("does not cache an invalid festival id", async () => {
    const response = await get("abc", "https://game.glitter.com.bo");

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBeNull();
    expect(response.headers.get("vary")).toBe("Origin");
  });

  it("does not cache a failed query", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.findStands.mockRejectedValue(new Error("db down"));

    const response = await get("3", "https://game.glitter.com.bo");

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBeNull();
    expect(response.headers.get("vary")).toBe("Origin");
  });
});

describe("OPTIONS /api/festivals/[festivalId]/stands", () => {
  it("varies on the origin", () => {
    const response = OPTIONS(
      new NextRequest("https://glitter.test/api/festivals/3/stands", {
        method: "OPTIONS",
        headers: { origin: "http://localhost:5273" },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5273",
    );
    expect(response.headers.get("vary")).toBe("Origin");
  });
});
