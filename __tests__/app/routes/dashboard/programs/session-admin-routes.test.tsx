import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchSessionForAdmin: vi.fn(),
  requireAdminOrFestivalAdmin: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("@/app/lib/users/helpers", () => ({
  requireAdminOrFestivalAdmin: mocks.requireAdminOrFestivalAdmin,
}));

vi.mock("@/app/lib/programs/data", () => ({
  fetchSessionForAdmin: mocks.fetchSessionForAdmin,
}));

vi.mock("@/app/components/dashboard/programs/session-detail-view", () => ({
  default: ({ session }: { session: { id: number } }) => (
    <p>detalle {session.id}</p>
  ),
}));

import ProgramSessionPage from "@/app/dashboard/programs/[id]/sessions/[sessionId]/page";
import StandaloneSessionPage from "@/app/dashboard/programs/sessions/[sessionId]/page";

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminOrFestivalAdmin.mockResolvedValue({ id: 1 });
});

function sessionRow(programId: number | null) {
  return { id: 11, programId };
}

async function renderPage(page: Promise<React.ReactElement>) {
  render(await page);
}

describe("program session admin route", () => {
  const open = (id: string, sessionId = "11") =>
    ProgramSessionPage({ params: Promise.resolve({ id, sessionId }) });

  it("renders a session under the program it belongs to", async () => {
    mocks.fetchSessionForAdmin.mockResolvedValue(sessionRow(3));
    await renderPage(open("3"));
    expect(screen.getByText("detalle 11")).toBeTruthy();
  });

  it("sends a standalone session to its standalone route", async () => {
    mocks.fetchSessionForAdmin.mockResolvedValue(sessionRow(null));
    await expect(open("3")).rejects.toThrow(
      "redirect:/dashboard/programs/sessions/11",
    );
  });

  it("sends a session filed under another program to that program", async () => {
    mocks.fetchSessionForAdmin.mockResolvedValue(sessionRow(4));
    await expect(open("3")).rejects.toThrow(
      "redirect:/dashboard/programs/4/sessions/11",
    );
  });

  it("404s an unknown session", async () => {
    mocks.fetchSessionForAdmin.mockResolvedValue(undefined);
    await expect(open("3")).rejects.toThrow("notFound");
  });
});

describe("standalone session admin route", () => {
  const open = (sessionId: string) =>
    StandaloneSessionPage({ params: Promise.resolve({ sessionId }) });

  it("renders a standalone session", async () => {
    mocks.fetchSessionForAdmin.mockResolvedValue(sessionRow(null));
    await renderPage(open("11"));
    expect(screen.getByText("detalle 11")).toBeTruthy();
  });

  it("sends a program session to its program's route", async () => {
    mocks.fetchSessionForAdmin.mockResolvedValue(sessionRow(3));
    await expect(open("11")).rejects.toThrow(
      "redirect:/dashboard/programs/3/sessions/11",
    );
  });

  it("404s a non-numeric id without querying", async () => {
    await expect(open("nueva")).rejects.toThrow("notFound");
    expect(mocks.fetchSessionForAdmin).not.toHaveBeenCalled();
  });

  it("sends a non-admin back to the dashboard", async () => {
    mocks.requireAdminOrFestivalAdmin.mockResolvedValue(null);
    await expect(open("11")).rejects.toThrow("redirect:/dashboard");
    expect(mocks.fetchSessionForAdmin).not.toHaveBeenCalled();
  });
});
