// @vitest-environment node

import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ComunicadoComposer from "@/app/components/comunicados/admin/composer/composer";
import ComunicadoReport from "@/app/components/comunicados/admin/report/comunicado-report";
import ScheduledComunicado from "@/app/components/comunicados/admin/scheduled/scheduled-comunicado";
import type { ComposerComunicado } from "@/app/lib/comunicados/queries";
import ComunicadoPage from "@/app/dashboard/communications/[id]/page";

/**
 * Which page a comunicado opens, and what the server hands it
 * (docs/IMPLEMENTATION-comunicados.md G1, E6, G6). The page is called as
 * the server calls it; what it returns is inspected, not rendered.
 */

const mocks = vi.hoisted(() => ({
  env: { VERCEL_ENV: "production" },
  fetchComunicado: vi.fn(),
  fetchCopySourceTitle: vi.fn(),
  audienceLabel: vi.fn(),
  // Not sent unless a test says so.
  fetchReport: vi.fn(async (): Promise<unknown> => null),
  fetchRecipients: vi.fn(),
  fetchRevisions: vi.fn(),
}));
vi.mock("@/env", () => ({ serverEnv: mocks.env }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  },
}));
vi.mock("@/app/lib/communications/access", () => ({
  requireCommunicationsAdmin: vi.fn(async () => ({ id: 1, role: "admin" })),
}));
vi.mock("@/app/lib/comunicados/queries", () => ({
  fetchComunicadoForComposer: mocks.fetchComunicado,
  fetchComunicadoCopySourceTitle: mocks.fetchCopySourceTitle,
  comunicadoAudienceLabel: mocks.audienceLabel,
}));
vi.mock("@/app/lib/comunicados/report", () => ({
  fetchComunicadoReport: mocks.fetchReport,
  fetchComunicadoRecipients: mocks.fetchRecipients,
}));
vi.mock("@/app/lib/comunicados/revisions", () => ({
  fetchComunicadoRevisions: mocks.fetchRevisions,
}));
vi.mock("@/app/lib/distribution_lists/queries", () => ({
  fetchFestivalLists: vi.fn(async () => []),
  fetchSavedLists: vi.fn(async () => []),
}));
vi.mock("@/app/lib/feature_flags/helpers", () => ({
  isFeatureLaunched: vi.fn(async () => true),
}));
vi.mock("@/app/components/comunicados/admin/composer/composer", () => ({
  default: () => null,
}));
vi.mock(
  "@/app/components/comunicados/admin/scheduled/scheduled-comunicado",
  () => ({ default: () => null }),
);
vi.mock("@/app/components/comunicados/admin/report/comunicado-report", () => ({
  default: () => null,
}));

const MINUTE = 60_000;

function comunicado(
  overrides: Partial<ComposerComunicado> = {},
): ComposerComunicado {
  return {
    id: 7,
    status: "draft",
    version: 3,
    title: "Cambio de horario de armado",
    doc: [],
    actionLabel: null,
    actionPath: null,
    sendEmail: true,
    sendPush: false,
    audience: { festivals: [12], lists: [4], people: [30, 31] },
    audienceUnreadable: false,
    essential: false,
    essentialReason: null,
    scheduledAt: null,
    scheduledByName: null,
    scheduleMissedAt: null,
    scheduleMissedReason: null,
    scheduleMissedDetail: null,
    createdAt: new Date("2026-10-20T12:00:00Z"),
    updatedAt: new Date("2026-10-20T12:00:00Z"),
    sources: {
      festivals: [
        {
          id: 12,
          name: "Glitter Navidad 2026",
          label: "Confirmados · Glitter Navidad 2026",
        },
      ],
      lists: [{ id: 4, name: "Ilustradores", kind: "filter", archived: true }],
      people: [],
      missing: { festivals: [], lists: [], people: [] },
    },
    ...overrides,
  };
}

function open(searchParams: Record<string, string | string[]> = {}) {
  return ComunicadoPage({
    params: Promise.resolve({ id: "7" }),
    searchParams: Promise.resolve(searchParams),
  }) as Promise<ReactElement<Record<string, unknown>>>;
}

/** The composer inside the draft page's wrapper. */
async function composerOf(searchParams: Record<string, string | string[]>) {
  const page = await open(searchParams);
  const composer = (page.props as { children: ReactElement }).children;
  expect(composer.type).toBe(ComunicadoComposer);
  return composer.props as Record<string, unknown>;
}

describe("ComunicadoPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.env.VERCEL_ENV = "production";
  });

  describe("a sent comunicado", () => {
    const REPORT = { id: 7, currentRevision: 2 };
    const RECIPIENTS = { rows: [], total: 0, page: 2, pageCount: 1 };
    const REVISIONS = [
      { revision: 1, title: "Cambio de horario de armado" },
      { revision: 2, title: "Cambio de horario de armado (corregido)" },
    ];

    it("opens its report with its history, the table as the URL asks", async () => {
      mocks.fetchReport.mockResolvedValueOnce(REPORT);
      mocks.fetchRecipients.mockResolvedValueOnce(RECIPIENTS);
      mocks.fetchRevisions.mockResolvedValueOnce(REVISIONS);

      const page = await open({ filter: "unread", q: "ana", page: "2" });
      expect(page.type).toBe(ComunicadoReport);
      expect(page.props).toEqual({
        report: REPORT,
        revisions: REVISIONS,
        recipients: RECIPIENTS,
        filter: "unread",
        query: "ana",
        env: "production",
      });
      expect(mocks.fetchRevisions).toHaveBeenCalledWith(7);
      expect(mocks.fetchRecipients).toHaveBeenCalledWith(7, {
        filter: "unread",
        query: "ana",
        page: 2,
      });
      expect(mocks.fetchComunicado).not.toHaveBeenCalled();
    });

    it("shows no history when it cannot be read", async () => {
      mocks.fetchReport.mockResolvedValueOnce(REPORT);
      mocks.fetchRecipients.mockResolvedValueOnce(RECIPIENTS);
      mocks.fetchRevisions.mockResolvedValueOnce(null);

      expect((await open()).props.revisions).toEqual([]);
    });
  });

  describe("a scheduled comunicado", () => {
    function scheduled(
      late: number,
      overrides: Partial<ComposerComunicado> = {},
    ) {
      return comunicado({
        status: "scheduled",
        version: 5,
        scheduledAt: new Date(Date.now() - late),
        scheduledByName: "Dennis",
        ...overrides,
      });
    }

    it("opens its read-only page, with dates as ISO strings", async () => {
      const row = scheduled(-60 * MINUTE);
      mocks.fetchComunicado.mockResolvedValue(row);
      mocks.audienceLabel.mockReturnValue(
        "Para: Confirmados · Glitter Navidad 2026, Ilustradores y 2 personas",
      );
      mocks.env.VERCEL_ENV = "preview";

      const page = await open();
      expect(page.type).toBe(ScheduledComunicado);
      expect(page.props).toMatchObject({
        comunicado: {
          id: 7,
          version: 5,
          title: "Cambio de horario de armado",
          sendEmail: true,
          sendPush: false,
          essential: false,
          essentialFestivalName: null,
          scheduledAt: row.scheduledAt!.toISOString(),
          scheduledByName: "Dennis",
        },
        audienceLabel:
          "Para: Confirmados · Glitter Navidad 2026, Ilustradores y 2 personas",
        overdue: false,
        env: "preview",
      });
      // The names behind the stored audience, archived lists included.
      expect(mocks.audienceLabel).toHaveBeenCalledWith(row.audience, {
        festivals: new Map([[12, "Glitter Navidad 2026"]]),
        lists: new Map([[4, "Ilustradores"]]),
      });
      expect(mocks.fetchCopySourceTitle).not.toHaveBeenCalled();
    });

    it("is overdue 3 minutes after its time, by the server's clock", async () => {
      mocks.fetchComunicado.mockResolvedValue(scheduled(3 * MINUTE + 1_000));
      expect((await open()).props.overdue).toBe(true);

      mocks.fetchComunicado.mockResolvedValue(scheduled(2 * MINUTE));
      expect((await open()).props.overdue).toBe(false);
    });

    it("names the festival an essential email is for, as the send will", async () => {
      mocks.fetchComunicado.mockResolvedValue(
        scheduled(-60 * MINUTE, {
          essential: true,
          essentialReason: "El armado se adelanta",
        }),
      );
      expect((await open()).props.comunicado).toMatchObject({
        essential: true,
        essentialReason: "El armado se adelanta",
        essentialFestivalName: "Glitter Navidad 2026",
      });

      // Without email there is no email to name it in.
      mocks.fetchComunicado.mockResolvedValue(
        scheduled(-60 * MINUTE, { essential: true, sendEmail: false }),
      );
      expect(
        ((await open()).props.comunicado as Record<string, unknown>)
          .essentialFestivalName,
      ).toBeNull();
    });
  });

  describe("a draft", () => {
    it("names the comunicado it was copied from (G6)", async () => {
      mocks.fetchComunicado.mockResolvedValue(comunicado());
      mocks.fetchCopySourceTitle.mockResolvedValue("Cambio de horario");

      const props = await composerOf({ copia: "12" });
      expect(mocks.fetchCopySourceTitle).toHaveBeenCalledWith(12);
      expect(props.copiedFromTitle).toBe("Cambio de horario");
    });

    it("names nothing without a readable copia", async () => {
      mocks.fetchComunicado.mockResolvedValue(comunicado());

      const unreadable: Record<string, string>[] = [
        {},
        { copia: "abc" },
        { copia: "0" },
      ];
      for (const searchParams of unreadable) {
        expect((await composerOf(searchParams)).copiedFromTitle).toBeNull();
      }
      expect(mocks.fetchCopySourceTitle).not.toHaveBeenCalled();
    });

    it("names nothing when the source is gone or not the viewer's to read", async () => {
      mocks.fetchComunicado.mockResolvedValue(comunicado());
      mocks.fetchCopySourceTitle.mockResolvedValue(null);

      expect((await composerOf({ copia: "12" })).copiedFromTitle).toBeNull();
    });
  });

  it("goes back to the list once the comunicado is gone", async () => {
    mocks.fetchComunicado.mockResolvedValue(null);
    await expect(open()).rejects.toThrow(
      "NEXT_REDIRECT /dashboard/communications",
    );
  });
});
