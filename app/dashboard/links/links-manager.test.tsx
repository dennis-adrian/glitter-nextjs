import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LinksManager from "@/app/dashboard/links/links-manager";
import type { SiteLinkRow } from "@/app/lib/links/definitions";

const { actions, refresh } = vi.hoisted(() => ({
  actions: {
    createSiteLink: vi.fn(),
    createSocialLink: vi.fn(),
    updateSiteLink: vi.fn(),
    updateSocialLink: vi.fn(),
    deleteSiteLink: vi.fn(),
    setSiteLinkVisible: vi.fn(),
    setSocialPosition: vi.fn(),
    reorderSiteLinks: vi.fn(),
  },
  refresh: vi.fn(),
}));

vi.mock("@/app/lib/links/actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function link(overrides: Partial<SiteLinkRow>): SiteLinkRow {
  return {
    id: 1,
    kind: "link",
    label: "Tiendita",
    href: "/store",
    icon: "store",
    sortOrder: 0,
    isVisible: true,
    clickCount: 0,
    updatedAt: new Date("2026-11-09T12:00:00Z"),
    createdAt: new Date("2026-11-09T12:00:00Z"),
    ...overrides,
  };
}

const LINKS = [
  link({ id: 1, label: "Tiendita", clickCount: 3512 }),
  link({
    id: 2,
    label: "Correo",
    href: "mailto:info@productoraglitter.com",
    icon: "email",
    sortOrder: 1,
    clickCount: 1,
    isVisible: false,
  }),
  link({
    id: 3,
    kind: "social",
    label: "Instagram",
    href: "https://www.instagram.com/glitter.bo",
    icon: "instagram",
    clickCount: 12,
  }),
];

function renderManager(links = LINKS) {
  return render(
    <LinksManager
      initialLinks={links}
      publicUrl="https://www.glitter.com.bo/links"
    />,
  );
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  for (const action of Object.values(actions)) {
    action.mockResolvedValue({ success: true });
  }
});

describe("the links manager", () => {
  it("lists every link with its clicks, and the address for the bio", () => {
    renderManager();
    expect(screen.getByText("Tiendita")).toBeTruthy();
    expect(screen.getByText(/3[.,]512 clics · \/store/)).toBeTruthy();
    expect(screen.getByText(/1 clic · mailto:/)).toBeTruthy();
    expect(screen.getByText("https://www.glitter.com.bo/links")).toBeTruthy();
  });

  it("says so when there are no links yet", () => {
    renderManager([]);
    expect(screen.getByText(/Todavía no hay enlaces/)).toBeTruthy();
  });

  it("adds a link with the title, address and icon picked", async () => {
    renderManager();
    fireEvent.click(screen.getByRole("button", { name: /Nuevo enlace/ }));
    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Pre-registro Festicker" },
    });
    fireEvent.change(screen.getByLabelText("Enlace"), {
      target: { value: "/festivals/festicker" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entrada" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(actions.createSiteLink).toHaveBeenCalledWith({
        label: "Pre-registro Festicker",
        href: "/festivals/festicker",
        icon: "ticket",
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.queryByLabelText("Título")).toBeNull();
  });

  it("keeps the form open and shows why a link was refused", async () => {
    actions.createSiteLink.mockResolvedValue({
      success: false,
      message: "El enlace no es válido.",
    });
    renderManager();
    fireEvent.click(screen.getByRole("button", { name: /Nuevo enlace/ }));
    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Roto" },
    });
    fireEvent.change(screen.getByLabelText("Enlace"), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "El enlace no es válido.",
    );
    expect(screen.getByLabelText("Título")).toBeTruthy();
  });

  it("edits a link starting from what it has", async () => {
    renderManager();
    const row = screen.getByText("Tiendita").closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: /Editar/ }));
    const title = screen.getByLabelText("Título") as HTMLInputElement;
    expect(title.value).toBe("Tiendita");
    fireEvent.change(title, { target: { value: "Tienda" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(actions.updateSiteLink).toHaveBeenCalledWith(1, {
        label: "Tienda",
        href: "/store",
        icon: "store",
      }),
    );
  });

  it("hides and shows a link from its switch", async () => {
    renderManager();
    const tiendita = screen.getByLabelText("Visible", {
      selector: "#link-visible-1",
    });
    const correo = screen.getByLabelText("Visible", {
      selector: "#link-visible-2",
    });
    expect(correo.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(tiendita);
    await waitFor(() =>
      expect(actions.setSiteLinkVisible).toHaveBeenCalledWith(1, false),
    );
  });

  it("deletes only after confirming", async () => {
    renderManager();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar Tiendita" }));
    expect(actions.deleteSiteLink).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(actions.deleteSiteLink).toHaveBeenCalledWith(1));
  });

  it("keeps social icons in a section of their own", () => {
    renderManager();
    const socials = screen.getByRole("region", { name: "Íconos sociales" });
    expect(within(socials).getByText("Instagram")).toBeTruthy();
    expect(within(socials).queryByText("Tiendita")).toBeNull();
    const links = screen.getByRole("region", { name: "Enlaces" });
    expect(within(links).getByText("Tiendita")).toBeTruthy();
    expect(within(links).queryByText("Instagram")).toBeNull();
  });

  it("adds a social icon from the username its network asks for", async () => {
    renderManager();
    fireEvent.click(screen.getByRole("button", { name: /Nuevo ícono social/ }));
    // Instagram has its icon already, so it is not offered again.
    expect(screen.queryByRole("button", { name: "Instagram" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "TikTok" }));
    fireEvent.change(screen.getByLabelText("Usuario de TikTok"), {
      target: { value: "@glitter.bo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(actions.createSocialLink).toHaveBeenCalledWith({
        network: "tiktok",
        value: "@glitter.bo",
      }),
    );
  });

  it("edits a social icon starting from its username", async () => {
    renderManager();
    const row = screen.getByText("Instagram").closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: /Editar/ }));
    const field = screen.getByLabelText(
      "Usuario de Instagram",
    ) as HTMLInputElement;
    expect(field.value).toBe("@glitter.bo");
    fireEvent.change(field, { target: { value: "festival.glitter" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(actions.updateSocialLink).toHaveBeenCalledWith(
        3,
        "festival.glitter",
      ),
    );
  });

  it("moves the social icons below the links from the position picker", async () => {
    renderManager();
    const top = screen.getByLabelText("Arriba") as HTMLInputElement;
    const bottom = screen.getByLabelText("Abajo") as HTMLInputElement;
    expect(top.checked).toBe(true);
    fireEvent.click(bottom);
    await waitFor(() =>
      expect(actions.setSocialPosition).toHaveBeenCalledWith("bottom"),
    );
    expect(bottom.checked).toBe(true);
  });
});
