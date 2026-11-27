// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

const fetchCall = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/app/lib/volunteers/queries", () => ({
  fetchCurrentVolunteerCall: fetchCall,
}));
vi.mock("@/app/components/volunteers/volunteer-application-wizard", () => ({
  default: () => null,
}));

import VolunteerApplyPage from "@/app/(site)/(routes)/voluntarios/postular/page";

const DAY = 24 * 60 * 60 * 1000;

function call(closesAt: Date) {
  return {
    festival: {
      id: 1,
      name: "Glitter v11",
      locationLabel: null,
      address: null,
      days: [],
    },
    applicationsCloseAt: closesAt,
    induction: null,
    roles: [
      { id: 1, name: "A", description: "" },
      { id: 2, name: "B", description: "" },
    ],
    shifts: [
      {
        id: 1,
        label: "Montaje",
        startsAt: new Date(Date.now() + 30 * DAY),
        endsAt: new Date(Date.now() + 30 * DAY + 4 * 3600_000),
      },
    ],
    ageCutoffDate: "2099-01-01",
  };
}

afterEach(() => {
  fetchCall.mockReset();
  redirectMock.mockClear();
});

describe("/voluntarios/postular", () => {
  it("sends people back to /voluntarios once the call has closed", async () => {
    fetchCall.mockResolvedValue(call(new Date(Date.now() - 60_000)));
    await expect(VolunteerApplyPage()).rejects.toThrow(
      "NEXT_REDIRECT:/voluntarios",
    );
  });

  it("sends people back when there is no call", async () => {
    fetchCall.mockResolvedValue(null);
    await expect(VolunteerApplyPage()).rejects.toThrow(
      "NEXT_REDIRECT:/voluntarios",
    );
  });

  it("renders the form while the call is open", async () => {
    fetchCall.mockResolvedValue(call(new Date(Date.now() + DAY)));
    await expect(VolunteerApplyPage()).resolves.toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
