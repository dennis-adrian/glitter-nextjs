// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));

import { GET } from "@/app/launch/route";

function launch() {
  return GET(new NextRequest("https://www.glitter.com.bo/launch"));
}

describe("GET /launch", () => {
  beforeEach(() => authMock.mockReset());

  it("opens a signed-in person's portal", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    const response = await launch();

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://www.glitter.com.bo/portal",
    );
  });

  it("opens sign in for anyone else, never the marketing landing", async () => {
    authMock.mockResolvedValue({ userId: null });
    const response = await launch();

    expect(response.headers.get("location")).toBe(
      "https://www.glitter.com.bo/sign_in",
    );
  });
});
