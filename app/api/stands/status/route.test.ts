import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const consumeRateLimitMock = vi.hoisted(() => vi.fn());
const getSectorMock = vi.hoisted(() => vi.fn());
const enrollmentMock = vi.hoisted(() => vi.fn());
const loadRowsMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

vi.mock("@/app/lib/rate-limit", () => ({
  consumeActionRateLimit: consumeRateLimitMock,
}));

vi.mock("@/app/lib/stands/status-service", () => ({
  getFestivalSectorForStatus: getSectorMock,
  hasAcceptedFestivalEnrollment: enrollmentMock,
  loadSectorStandStatusRows: loadRowsMock,
}));

import { GET } from "@/app/api/stands/status/route";

function request(sectorId: string) {
  return new NextRequest(
    `http://localhost/api/stands/status?sectorId=${sectorId}`,
  );
}

describe("GET /api/stands/status", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    consumeRateLimitMock.mockReset();
    getSectorMock.mockReset();
    enrollmentMock.mockReset();
    loadRowsMock.mockReset();
    consumeRateLimitMock.mockResolvedValue(true);
    getSectorMock.mockResolvedValue({ id: 4, festivalId: 10 });
    enrollmentMock.mockResolvedValue(true);
    loadRowsMock.mockResolvedValue({
      stands: [
        { standId: 21, storedStatus: "available", updatedAt: null },
      ],
      activeHoldStandIds: new Set(),
    });
  });

  it("rejects unauthenticated callers", async () => {
    currentProfileMock.mockResolvedValue(null);
    const response = await GET(request("4"));
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getSectorMock).not.toHaveBeenCalled();
    expect(enrollmentMock).not.toHaveBeenCalled();
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
    expect(loadRowsMock).not.toHaveBeenCalled();
  });

  it("rejects a verified participant who is not enrolled", async () => {
    currentProfileMock.mockResolvedValue({
      id: 8,
      role: "user",
      status: "verified",
    });
    enrollmentMock.mockResolvedValue(false);
    const response = await GET(request("4"));
    expect(response.status).toBe(403);
    expect(loadRowsMock).not.toHaveBeenCalled();
  });

  it("rate-limits by user", async () => {
    currentProfileMock.mockResolvedValue({
      id: 8,
      role: "user",
      status: "verified",
    });
    consumeRateLimitMock.mockResolvedValue(false);
    const response = await GET(request("4"));
    expect(response.status).toBe(429);
    expect(consumeRateLimitMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: "stand-status:user:8" }),
    );
    expect(loadRowsMock).not.toHaveBeenCalled();
  });

  it("returns a versioned minimal payload for enrolled participants", async () => {
    currentProfileMock.mockResolvedValue({
      id: 8,
      role: "user",
      status: "verified",
    });
    const response = await GET(request("4"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.availableCount).toBe(1);
    expect(body.stands).toEqual([
      { standId: 21, effectiveStatus: "available", updatedAt: null },
    ]);
    expect(typeof body.version).toBe("number");
    expect(body).not.toHaveProperty("email");
  });

  it("lets admins skip enrollment", async () => {
    currentProfileMock.mockResolvedValue({
      id: 1,
      role: "admin",
      status: "pending",
    });
    enrollmentMock.mockResolvedValue(false);
    const response = await GET(request("4"));
    expect(response.status).toBe(200);
  });
});
