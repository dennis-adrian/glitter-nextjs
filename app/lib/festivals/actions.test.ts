// @vitest-environment node
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminOrFestivalAdmin = vi.hoisted(() => vi.fn());
const sendEmail = vi.hoisted(() => vi.fn());
const fetchVisitorsEmails = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => {
  const selectWhere = vi.fn();
  const updateReturning = vi.fn();
  return {
    selectWhere,
    updateReturning,
    client: {
      query: {
        festivalSectors: { findMany: vi.fn() },
        festivals: { findFirst: vi.fn() },
      },
      select: vi.fn(() => ({ from: () => ({ where: selectWhere }) })),
      update: vi.fn(() => ({
        set: () => ({ where: () => ({ returning: updateReturning }) }),
      })),
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/lib/users/helpers", () => ({ requireAdminOrFestivalAdmin }));
vi.mock("@/app/vendors/resend", () => ({ sendEmail }));
vi.mock("@/app/data/visitors/actions", () => ({ fetchVisitorsEmails }));
vi.mock("@/db", () => ({ db: db.client }));

import {
  getFestivalAvailableUsers,
  sendUserEmailsTemp,
  updateFestivalRegistration,
} from "@/app/lib/festivals/actions";

const admin = { id: 1, role: "admin" };
const festival = {
  id: 12,
  name: "Glitter 12va edición",
  festivalType: "glitter",
  publicRegistration: true,
  reservationsStartDate: new Date("2026-11-01T14:00:00Z"),
  festivalDates: [
    {
      startDate: new Date("2026-12-05T14:00:00Z"),
      endDate: new Date("2026-12-05T22:00:00Z"),
    },
  ],
};
const storedProfile = {
  id: 7,
  email: "stored@example.com",
  displayName: "Perfil Guardado",
  firstName: null,
  lastName: null,
  status: "verified",
  category: "illustration",
};

function renderSql(condition: SQL) {
  return new PgDialect().sqlToQuery(condition);
}

describe("festival email actions", () => {
  beforeEach(() => {
    requireAdminOrFestivalAdmin.mockReset();
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ error: null });
    fetchVisitorsEmails.mockReset();
    fetchVisitorsEmails.mockResolvedValue([
      { id: 1, email: "visitor@example.com" },
    ]);
    db.selectWhere.mockReset();
    db.updateReturning.mockReset();
    db.client.select.mockClear();
    db.client.update.mockClear();
    db.client.query.festivalSectors.findMany.mockReset();
    db.client.query.festivalSectors.findMany.mockResolvedValue([
      { stands: [{ standCategory: "illustration" }] },
    ]);
    db.client.query.festivals.findFirst.mockReset();
    db.client.query.festivals.findFirst.mockResolvedValue(festival);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("getFestivalAvailableUsers", () => {
    it("rejects an unauthorized caller without reading profiles", async () => {
      requireAdminOrFestivalAdmin.mockResolvedValue(null);

      await expect(getFestivalAvailableUsers(festival.id)).rejects.toThrow(
        "No autorizado",
      );
      expect(db.client.query.festivalSectors.findMany).not.toHaveBeenCalled();
      expect(db.client.select).not.toHaveBeenCalled();
    });

    it("returns only the columns the dashboard list renders", async () => {
      requireAdminOrFestivalAdmin.mockResolvedValue(admin);
      const rows = [
        {
          id: 7,
          displayName: "Perfil",
          email: "p@example.com",
          category: "illustration",
        },
      ];
      db.selectWhere.mockResolvedValue(rows);

      await expect(getFestivalAvailableUsers(festival.id)).resolves.toEqual(
        rows,
      );
      const [columns] = db.client.select.mock.calls[0] as unknown as [
        Record<string, unknown>,
      ];
      expect(Object.keys(columns).sort()).toEqual([
        "category",
        "displayName",
        "email",
        "id",
      ]);
    });
  });

  describe("sendUserEmailsTemp", () => {
    it("rejects an unauthorized caller without sending mail", async () => {
      requireAdminOrFestivalAdmin.mockResolvedValue(null);

      await expect(sendUserEmailsTemp([7], festival.id)).resolves.toEqual({
        success: false,
        message: "No autorizado",
      });
      expect(db.client.select).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("refuses caller-supplied profiles in place of ids", async () => {
      requireAdminOrFestivalAdmin.mockResolvedValue(admin);
      const forged = [
        { ...storedProfile, email: "victim@example.com" },
      ] as unknown as number[];

      await expect(sendUserEmailsTemp(forged, festival.id)).resolves.toEqual({
        success: false,
        message: "Solicitud inválida",
      });
      expect(db.client.select).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("mails the stored address of eligible profiles among the given ids", async () => {
      vi.useFakeTimers();
      requireAdminOrFestivalAdmin.mockResolvedValue(admin);
      db.selectWhere.mockResolvedValue([storedProfile]);

      const pending = sendUserEmailsTemp([7, 9], festival.id);
      await vi.runAllTimersAsync();

      await expect(pending).resolves.toMatchObject({ success: true });
      const [condition] = db.selectWhere.mock.calls[0] as [SQL];
      const { sql, params } = renderSql(condition);
      expect(sql).toContain('"users"."id" in');
      expect(params).toEqual(
        expect.arrayContaining([7, 9, "verified", "illustration"]),
      );
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: ["stored@example.com"] }),
      );
    });
  });

  describe("updateFestivalRegistration", () => {
    it("rejects an unauthorized caller without updating or mailing", async () => {
      requireAdminOrFestivalAdmin.mockResolvedValue(null);

      await expect(
        updateFestivalRegistration(true, festival.id),
      ).resolves.toEqual({ success: false, message: "No autorizado" });
      expect(db.client.update).not.toHaveBeenCalled();
      expect(fetchVisitorsEmails).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("rejects malformed input before touching the festival", async () => {
      requireAdminOrFestivalAdmin.mockResolvedValue(admin);

      await expect(
        updateFestivalRegistration("true" as unknown as boolean, festival.id),
      ).resolves.toEqual({ success: false, message: "Festival inválido" });
      await expect(updateFestivalRegistration(true, 0)).resolves.toEqual({
        success: false,
        message: "Festival inválido",
      });
      expect(db.client.update).not.toHaveBeenCalled();
    });

    it("reports a missing festival without mailing visitors", async () => {
      requireAdminOrFestivalAdmin.mockResolvedValue(admin);
      db.updateReturning.mockResolvedValue([]);

      await expect(
        updateFestivalRegistration(true, festival.id),
      ).resolves.toEqual({ success: false, message: "Festival no encontrado" });
      expect(fetchVisitorsEmails).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("opens registration and invites visitors for an authorized caller", async () => {
      vi.useFakeTimers();
      requireAdminOrFestivalAdmin.mockResolvedValue(admin);
      db.updateReturning.mockResolvedValue([{ festivalId: festival.id }]);

      const pending = updateFestivalRegistration(true, festival.id);
      await vi.runAllTimersAsync();

      await expect(pending).resolves.toMatchObject({ success: true });
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ bcc: ["visitor@example.com"] }),
      );
    });
  });
});
