// @vitest-environment node

import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ComunicadoEditor from "@/app/components/comunicados/admin/edit/comunicado-editor";
import type { ComunicadoReport } from "@/app/lib/comunicados/report";
import EditComunicadoPage from "@/app/dashboard/communications/[id]/edit/page";

/**
 * Which comunicados the edit page opens, and what it seeds the editor with
 * (docs/IMPLEMENTATION-comunicados.md F1, G1, G7). The page is called as the
 * server calls it; what it returns is inspected, not rendered.
 */

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  fetchReport: vi.fn(),
  fetchComunicado: vi.fn(),
  fetchRevision: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  },
}));
vi.mock("@/app/lib/communications/access", () => ({
  requireCommunicationsAdmin: mocks.requireAdmin,
}));
vi.mock("@/app/lib/comunicados/report", () => ({
  fetchComunicadoReport: mocks.fetchReport,
}));
vi.mock("@/app/lib/comunicados/queries", () => ({
  fetchComunicadoForComposer: mocks.fetchComunicado,
}));
vi.mock("@/app/lib/comunicados/revisions", () => ({
  fetchComunicadoRevision: mocks.fetchRevision,
}));
vi.mock("@/app/components/comunicados/admin/edit/comunicado-editor", () => ({
  default: () => null,
}));

const DOC = [
  {
    type: "paragraph",
    content: [{ type: "text", text: "El armado empieza a las 9." }],
  },
];

function report(overrides: Partial<ComunicadoReport> = {}): ComunicadoReport {
  return {
    id: 7,
    title: "Cambio de horario de armado",
    campaignId: 70,
    campaignStatus: "completed",
    sentAt: new Date("2026-10-24T14:12:00Z"),
    sentByName: "Dennis",
    currentRevision: 2,
    html: "<p>El armado empieza a las 9.</p>",
    sendEmail: true,
    sendPush: false,
    essential: false,
    essentialReason: null,
    essentialConfirmedByName: null,
    essentialConfirmedAt: null,
    retractedAt: null,
    retractedByName: null,
    retractReason: null,
    summary: null,
    kpis: {
      recipients: 1240,
      notReceived: 0,
      stagingSkipped: 0,
      read: 512,
      notified: 1240,
      emailSent: 1180,
      emailPlanned: 1191,
      emailUnsubscribed: 0,
      emailSuppressed: 0,
      emailFailed: 0,
      emailOtherSkipped: 0,
      emailQueued: 8,
      maybeSent: 3,
      bounces: 0,
      confirmedSent: 1180,
      pushSent: 0,
      pushTotal: 0,
      pendingRecipients: 0,
    },
    banners: { configStalled: false, quota: false, stalledSince: null },
    retractCounts: {
      people: 1240,
      queuedEmails: 8,
      maybeSentEmails: 3,
      sentEmails: 1180,
    },
    retryCounts: { emails: 0, people: 0, maybeSentEmails: 0 },
    ...overrides,
  };
}

const REVISION = {
  revision: 2,
  title: "Cambio de horario de armado",
  doc: DOC,
  html: "<p>El armado empieza a las 9.</p>",
  text: "El armado empieza a las 9.",
  actionLabel: "Ver mi reserva",
  actionPath: "/my_participations",
  editNote: "Cambió el horario",
  createdAt: new Date("2026-10-25T14:12:00Z"),
  createdByName: "Ana",
};

function open(id = "7") {
  return EditComunicadoPage({
    params: Promise.resolve({ id }),
  }) as Promise<ReactElement<Record<string, unknown>>>;
}

describe("EditComunicadoPage", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("seeds the editor from the current revision and the report", async () => {
    mocks.fetchReport.mockResolvedValue(report());
    mocks.fetchRevision.mockResolvedValue(REVISION);

    const page = await open();
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.fetchRevision).toHaveBeenCalledWith(7, 2);
    expect(page.type).toBe(ComunicadoEditor);
    expect(page.props).toEqual({
      comunicadoId: 7,
      revision: 2,
      title: "Cambio de horario de armado",
      doc: DOC,
      actionLabel: "Ver mi reserva",
      actionPath: "/my_participations",
      essential: false,
      essentialFestivalName: null,
      sendEmail: true,
      sendPush: false,
      sending: false,
      counts: {
        people: 1240,
        queuedEmails: 8,
        maybeSentEmails: 3,
        sentEmails: 1180,
      },
    });
  });

  it("tells the dialog it still sends, and names an essential email's festival", async () => {
    mocks.fetchReport.mockResolvedValue(
      report({
        campaignStatus: "processing",
        essential: true,
        essentialReason: "El armado se adelanta",
        summary: {
          essentialFestival: { id: 12, name: "Glitter Navidad 2026" },
        } as ComunicadoReport["summary"],
      }),
    );
    mocks.fetchRevision.mockResolvedValue(REVISION);

    expect((await open()).props).toMatchObject({
      essential: true,
      essentialFestivalName: "Glitter Navidad 2026",
      sending: true,
    });
  });

  it("checks who is asking before it reads anything", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(open()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.fetchReport).not.toHaveBeenCalled();
  });

  it("is not found for an id that cannot be one", async () => {
    for (const id of ["abc", "0", "-3", "1.5"]) {
      await expect(open(id)).rejects.toThrow("NEXT_NOT_FOUND");
    }
    expect(mocks.fetchReport).not.toHaveBeenCalled();
  });

  it("sends a draft or a scheduled one to its own page", async () => {
    mocks.fetchReport.mockResolvedValue(null);
    mocks.fetchComunicado.mockResolvedValue({ id: 7, status: "draft" });

    await expect(open()).rejects.toThrow(
      "NEXT_REDIRECT /dashboard/communications/7",
    );
    expect(mocks.fetchRevision).not.toHaveBeenCalled();
  });

  it("is not found when there is no comunicado at all", async () => {
    mocks.fetchReport.mockResolvedValue(null);
    mocks.fetchComunicado.mockResolvedValue(null);

    await expect(open()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("sends a retracted one to its page: it cannot change any more", async () => {
    mocks.fetchReport.mockResolvedValue(
      report({ retractedAt: new Date("2026-10-25T15:02:00Z") }),
    );

    await expect(open()).rejects.toThrow(
      "NEXT_REDIRECT /dashboard/communications/7",
    );
    expect(mocks.fetchRevision).not.toHaveBeenCalled();
  });

  it("is not found when the revision cannot be read", async () => {
    mocks.fetchReport.mockResolvedValue(report());
    mocks.fetchRevision.mockResolvedValue(null);

    await expect(open()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
