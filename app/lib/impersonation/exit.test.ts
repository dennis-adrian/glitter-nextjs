import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/impersonation/viewer", () => ({
  getClerkSession: async () => ({ userId: "user_admin", sessionId: "sess_1" }),
}));
vi.mock("@/app/lib/impersonation/queries", () => ({
  findOpenImpersonationSession: async () => {
    throw new Error("database down");
  },
  endImpersonationSession: vi.fn(),
}));

import { exitImpersonation } from "@/app/lib/impersonation/exit";

describe("exitImpersonation", () => {
  it("lets the admin out even when the database fails", async () => {
    const set = vi.fn();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      exitImpersonation(
        { get: () => ({ value: "a".repeat(43) }), set },
        "exited",
      ),
    ).resolves.toEqual({ returnTo: "/dashboard", ended: false });
    expect(set).toHaveBeenCalledWith(
      "glitter_view_as",
      "",
      expect.objectContaining({ maxAge: 0 }),
    );
    errorLog.mockRestore();
  });
});
