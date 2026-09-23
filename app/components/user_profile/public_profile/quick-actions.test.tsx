import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The modals import server actions; the menu is what is under test.
vi.mock("@/app/components/users/form/delete-profile-modal", () => ({
  DeleteProfileModal: () => null,
}));
vi.mock("@/app/components/users/form/verify-user-modal", () => ({
  VerifyProfileModal: () => null,
}));
vi.mock("@/app/components/users/form/disable-profile-modal", () => ({
  DisableProfileModal: () => null,
}));
vi.mock("@/app/components/users/form/reject-profile-modal", () => ({
  RejectProfileModal: () => null,
}));
vi.mock("@/app/components/users/form/pause-participant-modal", () => ({
  PauseParticipantModal: () => null,
}));
vi.mock("@/app/components/users/form/unpause-participant-modal", () => ({
  UnpauseParticipantModal: () => null,
}));

import DashboardViewerProvider from "@/app/components/dashboard/dashboard-viewer-provider";
import ProfileQuickActions from "@/app/components/user_profile/public_profile/quick-actions";

function openMenuFor(
  role: "admin" | "festival_admin",
  status: "pending" | "verified" | "paused" | "banned",
) {
  render(
    <DashboardViewerProvider viewer={{ id: 1, role }}>
      <ProfileQuickActions
        profile={{ id: 7, status, userRequests: [] } as never}
        activitySummary={
          status === "verified"
            ? ({ isPauseEligible: true } as never)
            : undefined
        }
      />
    </DashboardViewerProvider>,
  );
  fireEvent.keyDown(screen.getByRole("button", { name: "Acciones" }), {
    key: "Enter",
  });
}

function item(name: string) {
  return screen.getByRole("menuitem", { name: new RegExp(name) });
}

afterEach(cleanup);

describe("ProfileQuickActions lifecycle entries", () => {
  it.each([
    ["pending", ["Verificar", "Rechazar", "Eliminar"]],
    ["verified", ["Deshabilitar", "Pausar cuenta", "Eliminar"]],
    ["paused", ["Deshabilitar", "Reactivar cuenta", "Eliminar"]],
  ] as const)(
    "shows them disabled with the reason to a festival admin (%s profile)",
    (status, entries) => {
      openMenuFor("festival_admin", status);

      for (const entry of entries) {
        expect(item(entry).hasAttribute("data-disabled")).toBe(true);
        expect(item(entry).getAttribute("title")).toBe("Solo administradores");
      }
    },
  );

  it.each([
    ["pending", ["Verificar", "Rechazar", "Eliminar"]],
    ["verified", ["Deshabilitar", "Pausar cuenta", "Eliminar"]],
    ["paused", ["Deshabilitar", "Reactivar cuenta", "Eliminar"]],
  ] as const)(
    "leaves them enabled for an admin (%s profile)",
    (status, entries) => {
      openMenuFor("admin", status);

      for (const entry of entries) {
        expect(item(entry).hasAttribute("data-disabled")).toBe(false);
        expect(item(entry).getAttribute("title")).toBeNull();
      }
    },
  );

  it("keeps labelling a banned profile by its status for a festival admin", () => {
    openMenuFor("festival_admin", "banned");

    expect(item("Habilitar").hasAttribute("data-disabled")).toBe(true);
  });
});
