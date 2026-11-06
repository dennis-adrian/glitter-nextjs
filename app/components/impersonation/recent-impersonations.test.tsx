import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import RecentImpersonations from "@/app/components/impersonation/recent-impersonations";
import type { RecentImpersonation } from "@/app/lib/impersonation/definitions";

const admin = {
  id: 1,
  displayName: "Admin Uno",
  firstName: null,
  lastName: null,
  email: "admin@example.com",
  imageUrl: null,
};
const subject = {
  ...admin,
  id: 2,
  displayName: "Ana Pérez",
  email: "ana@example.com",
};

function row(overrides: Partial<RecentImpersonation>): RecentImpersonation {
  return {
    id: 1,
    state: "exited",
    startedAt: new Date("2026-11-01T15:00:00Z"),
    durationSeconds: 600,
    blockedWrites: 0,
    admin,
    subject,
    ...overrides,
  };
}

afterEach(() => cleanup());

function items() {
  return within(screen.getByRole("list")).getAllByRole("listitem");
}

describe("RecentImpersonations", () => {
  it("names the participant on the picker, and the admin on a person's page", () => {
    const { unmount } = render(
      <RecentImpersonations
        rows={[row({})]}
        show="subject"
        title="Recientes"
        empty=""
      />,
    );
    expect(items()[0]!.textContent).toContain("Ana Pérez");
    expect(items()[0]!.textContent).not.toContain("Admin Uno");
    unmount();
    render(
      <RecentImpersonations
        rows={[row({})]}
        show="admin"
        title="Vistas recientes"
        empty=""
      />,
    );
    expect(items()[0]!.textContent).toContain("Admin Uno");
    expect(items()[0]!.textContent).not.toContain("Ana Pérez");
  });

  it.each([
    ["exited", 600, "10 minutos · Salió"],
    ["expired", 3600, "60 minutos · Terminó sola"],
    ["signed_out", 59, "1 minuto · Cerró sesión"],
    ["active", 125, "2 minutos · En curso"],
  ] as const)(
    "says how a %s view went and for how long",
    (state, durationSeconds, text) => {
      render(
        <RecentImpersonations
          rows={[row({ state, durationSeconds })]}
          show="subject"
          title="Recientes"
          empty=""
        />,
      );
      expect(items()[0]!.textContent).toContain(text);
    },
  );

  it("counts blocked actions only when there were any", () => {
    render(
      <RecentImpersonations
        rows={[
          row({ id: 1, blockedWrites: 1 }),
          row({ id: 2, blockedWrites: 3 }),
          row({ id: 3 }),
        ]}
        show="subject"
        title="Recientes"
        empty=""
      />,
    );
    const [one, three, none] = items();
    expect(one!.textContent).toContain("1 acción bloqueada");
    expect(three!.textContent).toContain("3 acciones bloqueadas");
    expect(none!.textContent).not.toContain("bloquead");
  });

  it("keeps a view of a deleted account, saying so", () => {
    render(
      <RecentImpersonations
        rows={[row({ subject: null })]}
        show="subject"
        title="Recientes"
        empty=""
      />,
    );
    expect(items()[0]!.textContent).toContain("Cuenta eliminada");
  });

  it("says when there is nothing yet", () => {
    render(
      <RecentImpersonations
        rows={[]}
        show="admin"
        title="Vistas recientes"
        empty="Nadie entró todavía como esta persona."
      />,
    );
    expect(
      screen.getByText("Nadie entró todavía como esta persona."),
    ).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
