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
    fetchSiteLinkImage: vi.fn(),
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
// The real button talks to UploadThing; this one hands back a finished upload.
vi.mock("@/app/vendors/uploadthing", () => ({
  UploadButton: ({
    onClientUploadComplete,
  }: {
    onClientUploadComplete: (
      files: { serverData: { imageUrl: string } }[],
    ) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onClientUploadComplete([
          { serverData: { imageUrl: "https://app.ufs.sh/f/subida" } },
        ])
      }
    >
      Subir imagen
    </button>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function link(overrides: Partial<SiteLinkRow>): SiteLinkRow {
  return {
    id: 1,
    kind: "link",
    label: "Tiendita",
    href: "/store",
    icon: "store",
    sortOrder: 0,
    iconSvg: null,
    imageUrl: null,
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.clearAllMocks();
  // A phone: no room for the preview beside the editor. The drawer reads it.
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
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

  it("opens the public page on the domain it is on", () => {
    renderManager();
    const view = screen.getByRole("link", { name: /Ver página/ });
    expect(view.getAttribute("href")).toBe("/links");
  });

  it("previews the page with the visible links only, uncounted", () => {
    renderManager();
    fireEvent.click(screen.getByRole("button", { name: /Vista previa/ }));

    const preview = within(screen.getByRole("dialog"));
    const card = preview.getByRole("link", { name: "Tiendita" });
    expect(card.getAttribute("target")).toBe("_blank");
    expect(preview.getByRole("link", { name: "Instagram" })).toBeTruthy();
    // Hidden in the dashboard, so not on the page.
    expect(preview.queryByText("Correo")).toBeNull();
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
        imageUrl: null,
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
        imageUrl: null,
      }),
    );
  });

  describe("a link's thumbnail", () => {
    const OG_IMAGE = "https://app.ufs.sh/f/del-enlace";

    function openNewLink(href = "https://quiz.productoraglitter.com/glitter") {
      renderManager();
      fireEvent.click(screen.getByRole("button", { name: "Nuevo enlace" }));
      fireEvent.change(screen.getByLabelText("Título"), {
        target: { value: "Quiz" },
      });
      fireEvent.change(screen.getByLabelText("Enlace"), {
        target: { value: href },
      });
    }

    const save = () =>
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    it("takes the link's own image for a new link once its address is typed", async () => {
      actions.fetchSiteLinkImage.mockResolvedValue({
        success: true,
        imageUrl: OG_IMAGE,
      });
      openNewLink();
      fireEvent.blur(screen.getByLabelText("Enlace"));

      await waitFor(() =>
        expect(
          screen
            .getByRole("radio", { name: "Imagen" })
            .getAttribute("aria-checked"),
        ).toBe("true"),
      );
      expect(actions.fetchSiteLinkImage).toHaveBeenCalledWith(
        "https://quiz.productoraglitter.com/glitter",
      );
      save();
      await waitFor(() =>
        expect(actions.createSiteLink).toHaveBeenCalledWith({
          label: "Quiz",
          href: "https://quiz.productoraglitter.com/glitter",
          icon: "link",
          imageUrl: OG_IMAGE,
        }),
      );
    });

    it("keeps the icon when the link has no image, without complaining", async () => {
      const { toast } = await import("sonner");
      actions.fetchSiteLinkImage.mockResolvedValue({
        success: false,
        message: "No encontramos una imagen en ese enlace.",
      });
      openNewLink();
      fireEvent.blur(screen.getByLabelText("Enlace"));

      await waitFor(() =>
        expect(actions.fetchSiteLinkImage).toHaveBeenCalled(),
      );
      expect(
        screen
          .getByRole("radio", { name: "Ícono" })
          .getAttribute("aria-checked"),
      ).toBe("true");
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("does not look for an image for a path of this site or once a thumbnail was chosen", () => {
      openNewLink("/store");
      fireEvent.blur(screen.getByLabelText("Enlace"));
      expect(actions.fetchSiteLinkImage).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText("Enlace"), {
        target: { value: "https://quiz.productoraglitter.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Corazón" }));
      fireEvent.blur(screen.getByLabelText("Enlace"));
      expect(actions.fetchSiteLinkImage).not.toHaveBeenCalled();
    });

    it("says why when the link's image is asked for and there is none", async () => {
      const { toast } = await import("sonner");
      actions.fetchSiteLinkImage.mockResolvedValue({
        success: false,
        message: "No encontramos una imagen en ese enlace. Puedes subir una.",
      });
      openNewLink();
      fireEvent.click(screen.getByRole("radio", { name: "Imagen" }));
      fireEvent.click(
        screen.getByRole("button", { name: /Usar la del enlace/ }),
      );

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "No encontramos una imagen en ese enlace. Puedes subir una.",
        ),
      );
      // Image chosen, none there: saving says so instead of saving nothing.
      save();
      expect((await screen.findByRole("alert")).textContent).toMatch(
        /Agrega una imagen/,
      );
      expect(actions.createSiteLink).not.toHaveBeenCalled();
    });

    it("saves an uploaded image, and the icon again once it is removed", async () => {
      openNewLink("/store");
      fireEvent.click(screen.getByRole("radio", { name: "Imagen" }));
      fireEvent.click(screen.getByRole("button", { name: "Subir imagen" }));
      expect(screen.getByAltText("Miniatura del enlace")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: /Quitar/ }));
      fireEvent.click(screen.getByRole("radio", { name: "Ícono" }));
      save();
      await waitFor(() =>
        expect(actions.createSiteLink).toHaveBeenCalledWith({
          label: "Quiz",
          href: "/store",
          icon: "link",
          imageUrl: null,
        }),
      );
    });

    it("saves a link with no thumbnail at all", async () => {
      openNewLink("/store");
      fireEvent.click(screen.getByRole("radio", { name: "Ninguna" }));
      save();
      await waitFor(() =>
        expect(actions.createSiteLink).toHaveBeenCalledWith({
          label: "Quiz",
          href: "/store",
          icon: "none",
          imageUrl: null,
        }),
      );
    });

    it("finds an icon in the whole library by name", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          icons: [
            { ref: "si:spotify", set: "si", name: "spotify", label: "Spotify" },
          ],
        }),
      });
      vi.stubGlobal("fetch", fetchMock);
      openNewLink("/store");
      // The featured ones are there before anything is typed.
      expect(screen.getByText("Destacados")).toBeTruthy();
      fireEvent.change(screen.getByLabelText("Buscar íconos"), {
        target: { value: "spoti" },
      });

      fireEvent.click(
        await screen.findByRole("button", { name: "Spotify (Marcas)" }),
      );
      expect(fetchMock.mock.calls[0][0]).toBe("/api/links/icons?q=spoti");
      expect(screen.getByText("Elegido: spotify")).toBeTruthy();
      save();
      await waitFor(() =>
        expect(actions.createSiteLink).toHaveBeenCalledWith({
          label: "Quiz",
          href: "/store",
          icon: "si:spotify",
          imageUrl: null,
        }),
      );
    });

    it("opens a link on the thumbnail it has", () => {
      renderManager([
        link({ id: 7, label: "Con imagen", imageUrl: OG_IMAGE }),
        link({ id: 8, label: "Sin nada", icon: "none", sortOrder: 1 }),
        link({
          id: 9,
          label: "De la biblioteca",
          icon: "lucide:camera",
          iconSvg: "<svg></svg>",
          sortOrder: 2,
        }),
      ]);
      const checked = () =>
        screen
          .getAllByRole("radio")
          .find((radio) => radio.getAttribute("aria-checked") === "true")
          ?.textContent;
      const edit = (index: number) =>
        fireEvent.click(
          screen.getAllByRole("button", { name: /Editar/ })[index],
        );
      const cancel = () =>
        fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

      edit(0);
      expect(checked()).toBe("Imagen");
      cancel();
      edit(1);
      expect(checked()).toBe("Ninguna");
      cancel();
      edit(2);
      expect(checked()).toBe("Ícono");
      expect(screen.getByText("Elegido: camera")).toBeTruthy();
    });
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

  it("keeps a switch it just flipped while a form opens over it", async () => {
    renderManager();
    const [toggle] = screen.getAllByRole("switch", { checked: true });
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(toggle.getAttribute("aria-checked")).toBe("false"),
    );

    // The refresh has not brought the new list yet: the same props, rendered
    // again because a form opened, must not put the switch back.
    fireEvent.click(screen.getByRole("button", { name: "Nuevo enlace" }));
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("reports a call that fails outright and undoes what it showed", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { toast } = await import("sonner");
    const offline = new Error("Failed to fetch");
    renderManager();

    // The switch: stays as it was.
    actions.setSiteLinkVisible.mockRejectedValue(offline);
    const [toggle] = screen.getAllByRole("switch", { checked: true });
    fireEvent.click(toggle);
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    // The position: goes back to the one saved.
    actions.setSocialPosition.mockRejectedValue(offline);
    fireEvent.click(screen.getByLabelText("Abajo"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2));
    expect((screen.getByLabelText("Arriba") as HTMLInputElement).checked).toBe(
      true,
    );

    // Deleting: the row is still there.
    actions.deleteSiteLink.mockRejectedValue(offline);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar Tiendita" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(3));
    expect(screen.getByText("Tiendita")).toBeTruthy();

    // A form: stays open and says so.
    actions.createSiteLink.mockRejectedValue(offline);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo enlace" }));
    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Entradas" },
    });
    fireEvent.change(screen.getByLabelText("Enlace"), {
      target: { value: "/entradas" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /No se pudo guardar/,
    );

    expect(refresh).not.toHaveBeenCalled();
    logged.mockRestore();
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
