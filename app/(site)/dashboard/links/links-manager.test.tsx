import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LinksManager from "@/app/(site)/dashboard/links/links-manager";
import type { SiteLinkRow } from "@/app/lib/links/definitions";

// Set `hold` to keep the next upload on its way until `finish` is called.
const upload = vi.hoisted(() => ({
  hold: false,
  finish: null as null | (() => void),
}));
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
    updateLinksHeader: vi.fn(),
    reorderSiteLinks: vi.fn(),
  },
  refresh: vi.fn(),
}));

vi.mock("@/app/lib/links/actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
// The real button talks to UploadThing; this one hands back a finished upload.
vi.mock("@/app/vendors/uploadthing", () => ({
  UploadButton: ({
    onUploadBegin,
    onClientUploadComplete,
  }: {
    onUploadBegin?: (fileName: string) => void;
    onClientUploadComplete: (
      files: { serverData: { imageUrl: string } }[],
    ) => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        onUploadBegin?.("subida.png");
        const complete = () =>
          onClientUploadComplete([
            { serverData: { imageUrl: "https://app.ufs.sh/f/subida" } },
          ]);
        if (upload.hold) upload.finish = complete;
        else complete();
      }}
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
    layout: "classic",
    visibleFrom: null,
    visibleUntil: null,
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

const SPOTIFY = {
  ref: "si:spotify",
  set: "si",
  name: "spotify",
  label: "Spotify",
  svg: '<svg data-icon="spotify"></svg>',
};
const CAMERA = {
  ref: "lucide:camera",
  set: "lucide",
  name: "camera",
  label: "Camera",
  svg: '<svg data-icon="camera"></svg>',
};
const CAT = {
  ref: "lucide:cat",
  set: "lucide",
  name: "cat",
  label: "Cat",
  svg: '<svg data-icon="cat"></svg>',
};

/**
 * The picker's endpoint: the whole library is `CAMERA` and then `CAT`, one
 * per page; a search for "spoti" finds `SPOTIFY`.
 */
function iconPages() {
  return vi.fn(async (url: string) => {
    const params = new URL(url, "http://localhost").searchParams;
    const offset = Number(params.get("offset"));
    const body =
      params.get("q") === "spoti"
        ? { icons: [SPOTIFY], total: 1 }
        : { icons: [[CAMERA], [CAT]][offset] ?? [], total: 2 };
    return { ok: true, json: async () => body };
  });
}

/** When the page is read in these tests: 12 November 2026, noon in Bolivia. */
const NOW = new Date("2026-11-12T16:00:00Z");

function renderManager(
  links = LINKS,
  props: Partial<Parameters<typeof LinksManager>[0]> = {},
) {
  return render(
    <LinksManager
      initialLinks={links}
      publicUrl="https://www.glitter.com.bo/links"
      now={NOW.getTime()}
      {...props}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.clearAllMocks();
  upload.hold = false;
  upload.finish = null;
  // The editor starts at its top and goes back to its row; jsdom has no page
  // to scroll.
  vi.stubGlobal("scrollTo", vi.fn());
  // A switch inside a form measures itself.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // The icon picker asks for its first page as it opens.
  vi.stubGlobal("fetch", iconPages());
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

  describe("the position picker and the saved position", () => {
    const manager = (position: "top" | "bottom", links = LINKS) => (
      <LinksManager
        initialLinks={links}
        initialSocialPosition={position}
        publicUrl="https://www.glitter.com.bo/links"
        now={NOW.getTime()}
      />
    );
    const checked = (label: string) =>
      (screen.getByLabelText(label) as HTMLInputElement).checked;

    it("follows the saved position when a refresh brings a new one", () => {
      const { rerender } = render(manager("top"));
      expect(checked("Arriba")).toBe(true);

      // Someone else moved the icons; the page was refreshed.
      rerender(manager("bottom"));
      expect(checked("Abajo")).toBe(true);
    });

    it("keeps a choice still being saved when a refresh brings the same saved position", async () => {
      let answer: (value: unknown) => void = () => {};
      actions.setSocialPosition.mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        }),
      );
      const { rerender } = render(manager("top"));
      fireEvent.click(screen.getByLabelText("Abajo"));
      expect(checked("Abajo")).toBe(true);

      // A refresh for something else, with a new list and the old position.
      rerender(manager("top", [...LINKS]));
      expect(checked("Abajo")).toBe(true);

      answer({ success: true });
      await waitFor(() => expect(refresh).toHaveBeenCalled());
    });
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
        layout: "classic",
        visibleFrom: "",
        visibleUntil: "",
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
        layout: "classic",
        visibleFrom: "",
        visibleUntil: "",
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
          layout: "classic",
          visibleFrom: "",
          visibleUntil: "",
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

    it("takes the image of a page of this site too", async () => {
      actions.fetchSiteLinkImage.mockResolvedValue({
        success: true,
        imageUrl: OG_IMAGE,
      });
      openNewLink("/blog/festicker-2026");
      fireEvent.blur(screen.getByLabelText("Enlace"));

      await waitFor(() =>
        expect(actions.fetchSiteLinkImage).toHaveBeenCalledWith(
          "/blog/festicker-2026",
        ),
      );
      await waitFor(() =>
        expect(screen.getByAltText("Miniatura del enlace")).toBeTruthy(),
      );
    });

    it("does not look for an image for an email, or once a thumbnail was chosen", () => {
      openNewLink("info@productoraglitter.com");
      fireEvent.blur(screen.getByLabelText("Enlace"));
      expect(actions.fetchSiteLinkImage).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("radio", { name: "Imagen" }));
      expect(
        screen
          .getByRole("button", { name: /Usar la del enlace/ })
          .hasAttribute("disabled"),
      ).toBe(true);
      fireEvent.click(screen.getByRole("radio", { name: "Ícono" }));

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
          layout: "classic",
          visibleFrom: "",
          visibleUntil: "",
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
          layout: "classic",
          visibleFrom: "",
          visibleUntil: "",
        }),
      );
    });

    it("finds an icon in the whole library by name, without the featured ones", async () => {
      openNewLink("/store");
      fireEvent.change(screen.getByLabelText("Buscar íconos"), {
        target: { value: "spoti" },
      });

      fireEvent.click(
        await screen.findByRole("button", { name: "Spotify (Marcas)" }),
      );
      expect(fetch).toHaveBeenLastCalledWith(
        "/api/links/icons?q=spoti&offset=0",
        expect.anything(),
      );
      // A search is its results alone.
      expect(screen.queryByText("Destacados")).toBeNull();
      expect(screen.queryByRole("button", { name: "Corazón" })).toBeNull();
      expect(screen.getByText("Elegido: spotify")).toBeTruthy();
      save();
      await waitFor(() =>
        expect(actions.createSiteLink).toHaveBeenCalledWith({
          label: "Quiz",
          href: "/store",
          icon: "si:spotify",
          imageUrl: null,
          layout: "classic",
          visibleFrom: "",
          visibleUntil: "",
        }),
      );
    });

    it("lists every icon under the featured ones, more as it is asked for", async () => {
      openNewLink("/store");
      expect(screen.getByText("Destacados")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Corazón" })).toBeTruthy();
      expect(
        await screen.findByRole("button", { name: "Camera (Lucide)" }),
      ).toBeTruthy();
      expect(screen.getByText("Todos los íconos")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Cat (Lucide)" })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Cargar más" }));
      fireEvent.click(
        await screen.findByRole("button", { name: "Cat (Lucide)" }),
      );
      expect(fetch).toHaveBeenLastCalledWith(
        "/api/links/icons?q=&offset=1",
        expect.anything(),
      );
      // Both pages are in: nothing more to ask for.
      expect(screen.queryByRole("button", { name: "Cargar más" })).toBeNull();
      expect(screen.getByText("Elegido: cat")).toBeTruthy();
    });

    it("leaves out a page asked for before the search was started again", async () => {
      // The second page of the whole list is answered only when the test says.
      let answerSecondPage = () => {};
      const pages = iconPages();
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string) =>
          url.endsWith("q=&offset=1")
            ? new Promise((resolve) => {
                answerSecondPage = () =>
                  resolve({
                    ok: true,
                    json: async () => ({ icons: [CAT], total: 2 }),
                  });
              })
            : pages(url),
        ),
      );
      openNewLink("/store");
      await screen.findByRole("button", { name: "Camera (Lucide)" });
      fireEvent.click(screen.getByRole("button", { name: "Cargar más" }));

      // Away to a search and back: the same words, another list.
      const search = screen.getByLabelText("Buscar íconos");
      fireEvent.change(search, { target: { value: "spoti" } });
      await screen.findByRole("button", { name: "Spotify (Marcas)" });
      fireEvent.change(search, { target: { value: "" } });
      await screen.findByRole("button", { name: "Camera (Lucide)" });

      await act(async () => answerSecondPage());
      expect(screen.queryByRole("button", { name: "Cat (Lucide)" })).toBeNull();
      // And the new list still asks for its own pages.
      expect(screen.getByRole("button", { name: "Cargar más" })).toBeTruthy();
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

  describe("the featured design", () => {
    const IMAGE = "https://app.ufs.sh/f/subida";

    it("saves a link as featured with its image", async () => {
      renderManager();
      fireEvent.click(screen.getByRole("button", { name: "Nuevo enlace" }));
      fireEvent.change(screen.getByLabelText("Título"), {
        target: { value: "Entradas" },
      });
      fireEvent.change(screen.getByLabelText("Enlace"), {
        target: { value: "/entradas" },
      });
      fireEvent.click(screen.getByRole("radio", { name: "Destacado" }));
      fireEvent.click(screen.getByRole("radio", { name: "Imagen" }));
      fireEvent.click(screen.getByRole("button", { name: "Subir imagen" }));
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() =>
        expect(actions.createSiteLink).toHaveBeenCalledWith({
          label: "Entradas",
          href: "/entradas",
          icon: "link",
          imageUrl: IMAGE,
          layout: "featured",
          visibleFrom: "",
          visibleUntil: "",
        }),
      );
    });

    it("saves a link as featured with its icon, which is then what is shown large", async () => {
      renderManager();
      fireEvent.click(screen.getAllByRole("button", { name: /Editar/ })[1]);
      fireEvent.click(screen.getByRole("radio", { name: "Destacado" }));
      // The thumbnail stays the icon it was: nothing is asked for.
      expect(
        screen
          .getByRole("radio", { name: "Ícono" })
          .getAttribute("aria-checked"),
      ).toBe("true");
      expect(screen.getByText(/Muestra el ícono en grande/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() =>
        expect(actions.updateSiteLink).toHaveBeenCalledWith(
          1,
          expect.objectContaining({
            icon: "store",
            imageUrl: null,
            layout: "featured",
          }),
        ),
      );
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("says a featured link with no thumbnail is drawn classic", () => {
      renderManager();
      fireEvent.click(screen.getAllByRole("button", { name: /Editar/ })[1]);
      fireEvent.click(screen.getByRole("radio", { name: "Destacado" }));
      fireEvent.click(screen.getByRole("radio", { name: "Ninguna" }));
      expect(screen.getByText(/se muestra con el diseño clásico/)).toBeTruthy();
    });

    it("opens a featured link on that design", () => {
      renderManager([
        link({ id: 7, label: "Entradas", imageUrl: IMAGE, layout: "featured" }),
      ]);
      fireEvent.click(screen.getByRole("button", { name: /Editar/ }));
      expect(
        screen
          .getByRole("radio", { name: "Destacado" })
          .getAttribute("aria-checked"),
      ).toBe("true");
    });
  });

  describe("the preview, before anything is saved", () => {
    /** The preview, which on a phone is behind its floating button. */
    function openPreview() {
      fireEvent.click(screen.getByRole("button", { name: /Vista previa/ }));
      return within(screen.getByRole("dialog"));
    }
    const closePreview = () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Cerrar vista previa" }),
      );

    it("shows a link as its open form has it, and the saved one again on cancel", async () => {
      renderManager();
      fireEvent.click(screen.getAllByRole("button", { name: /Editar/ })[1]);
      fireEvent.change(screen.getByLabelText("Título"), {
        target: { value: "Tienda nueva" },
      });
      fireEvent.change(screen.getByLabelText("Enlace"), {
        target: { value: "javascript:alert(1)" },
      });
      // The form is modal, so what is behind it is inert: on a wide screen the
      // preview is beside it, and here it is reached past the form.
      fireEvent.click(screen.getByText("Vista previa"));
      const card = screen.getByRole("link", {
        name: "Tienda nueva",
        hidden: true,
      });
      // Typed, not saved; and never an address that would not be saved.
      expect(card.getAttribute("href")).toBe("/store");
      expect(actions.updateSiteLink).not.toHaveBeenCalled();
      fireEvent.click(screen.getByLabelText("Cerrar vista previa"));

      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
      const preview = openPreview();
      expect(preview.getByRole("link", { name: "Tiendita" })).toBeTruthy();
      expect(preview.queryByText("Tienda nueva")).toBeNull();
    });

    it("shows a new link after the others while it is being written", () => {
      renderManager();
      fireEvent.click(screen.getByRole("button", { name: "Nuevo enlace" }));
      fireEvent.change(screen.getByLabelText("Título"), {
        target: { value: "Entradas" },
      });
      fireEvent.change(screen.getByLabelText("Enlace"), {
        target: { value: "/entradas" },
      });
      fireEvent.click(screen.getByText("Vista previa"));

      const cards = screen
        .getAllByRole("link", { hidden: true })
        .filter((card) => card.getAttribute("target") === "_blank")
        .map((card) => card.textContent);
      expect(cards.at(-1)).toBe("Entradas");
      expect(actions.createSiteLink).not.toHaveBeenCalled();
    });

    it("hides a link in the preview as its switch is flipped, and shows it again if that is refused", async () => {
      let refuse: (value: unknown) => void = () => {};
      actions.setSiteLinkVisible.mockReturnValue(
        new Promise((resolve) => {
          refuse = resolve;
        }),
      );
      renderManager();
      const toggle = within(
        screen.getByRole("region", { name: "Enlaces" }),
      ).getByRole("switch", { checked: true });
      fireEvent.click(toggle);

      // Before the server has answered.
      let preview = openPreview();
      expect(preview.queryByRole("link", { name: "Tiendita" })).toBeNull();
      closePreview();

      refuse({ success: false, message: "No tienes permisos." });
      await waitFor(() =>
        expect(toggle.getAttribute("aria-checked")).toBe("true"),
      );
      preview = openPreview();
      expect(preview.getByRole("link", { name: "Tiendita" })).toBeTruthy();
    });

    it("moves the social icons in the preview as the position is picked", async () => {
      // Unanswered for as long as the test looks. Answered at its end: React
      // holds every later save behind one that never finishes.
      let answer: (value: unknown) => void = () => {};
      actions.setSocialPosition.mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        }),
      );
      renderManager();
      const order = () => {
        const preview = openPreview();
        const names = preview
          .getAllByRole("link")
          .map((card) => card.getAttribute("aria-label") ?? card.textContent);
        closePreview();
        return names;
      };
      expect(order()).toEqual(["Instagram", "Tiendita"]);

      fireEvent.click(screen.getByLabelText("Abajo"));
      expect(order()).toEqual(["Tiendita", "Instagram"]);

      answer({ success: true });
      await waitFor(() => expect(refresh).toHaveBeenCalled());
    });
  });

  describe("a save that is still on its way", () => {
    it.each([
      ["a link", 1, "updateSiteLink"],
      ["a social icon", 0, "updateSocialLink"],
    ] as const)(
      "keeps the editor of %s until it is answered, so its answer cannot close another",
      async (_what, row, action) => {
        let answer: (value: unknown) => void = () => {};
        actions[action].mockReturnValue(
          new Promise((resolve) => {
            answer = resolve;
          }),
        );
        renderManager();
        fireEvent.click(screen.getAllByRole("button", { name: /Editar/ })[row]);
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

        // No way out to the lists, and so to another row, while it is sent.
        const back = await screen.findByRole("button", { name: "Cancelar" });
        await waitFor(() => expect(back.hasAttribute("disabled")).toBe(true));
        fireEvent.click(back);
        expect(screen.getByRole("form")).toBeTruthy();
        expect(screen.queryByRole("alertdialog")).toBeNull();

        answer({ success: true });
        await waitFor(() => expect(screen.queryByRole("form")).toBeNull());
        expect(refresh).toHaveBeenCalledTimes(1);
      },
    );

    it("gives the way back again when the save is refused", async () => {
      actions.updateSiteLink.mockResolvedValue({
        success: false,
        message: "El enlace no es válido.",
      });
      renderManager();
      fireEvent.click(screen.getAllByRole("button", { name: /Editar/ })[1]);
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await screen.findByRole("alert", {}, { timeout: 5000 });
      await waitFor(
        () =>
          expect(
            screen
              .getByRole("button", { name: "Cancelar" })
              .hasAttribute("disabled"),
          ).toBe(false),
        { timeout: 5000 },
      );
    });
  });

  describe("leaving the editor", () => {
    const back = () =>
      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    it("leaves at once when nothing was changed", () => {
      renderManager();
      fireEvent.click(screen.getAllByRole("button", { name: /Editar/ })[1]);
      back();
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(screen.queryByRole("form")).toBeNull();
    });

    it("asks before losing a change, and stays when told to", () => {
      renderManager();
      fireEvent.click(screen.getAllByRole("button", { name: /Editar/ })[1]);
      fireEvent.change(screen.getByLabelText("Título"), {
        target: { value: "Tienda nueva" },
      });
      back();

      const question = within(screen.getByRole("alertdialog"));
      expect(question.getByText("¿Descartar los cambios?")).toBeTruthy();
      fireEvent.click(
        question.getByRole("button", { name: "Seguir editando" }),
      );
      expect((screen.getByLabelText("Título") as HTMLInputElement).value).toBe(
        "Tienda nueva",
      );
    });

    it("leaves without saving once the change is discarded", () => {
      renderManager();
      fireEvent.click(screen.getAllByRole("button", { name: /Editar/ })[1]);
      fireEvent.click(screen.getByRole("radio", { name: "Destacado" }));
      back();
      fireEvent.click(
        within(screen.getByRole("alertdialog")).getByRole("button", {
          name: "Descartar",
        }),
      );

      expect(screen.queryByRole("form")).toBeNull();
      expect(actions.updateSiteLink).not.toHaveBeenCalled();
      expect(screen.getByRole("region", { name: "Enlaces" })).toBeTruthy();
    });

    it("does not ask about a change that was undone by hand", () => {
      renderManager();
      fireEvent.click(screen.getAllByRole("button", { name: /Editar/ })[1]);
      const title = screen.getByLabelText("Título");
      fireEvent.change(title, { target: { value: "Otra cosa" } });
      fireEvent.change(title, { target: { value: "Tiendita" } });
      back();
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(screen.queryByRole("form")).toBeNull();
    });

    it("asks for a social icon being added too", () => {
      renderManager();
      fireEvent.click(
        screen.getByRole("button", { name: "Nuevo ícono social" }),
      );
      fireEvent.click(screen.getByRole("button", { name: "TikTok" }));
      back();
      expect(screen.getByRole("alertdialog")).toBeTruthy();
    });
  });

  describe("the editor, in place of the lists", () => {
    it("takes the lists' place while a link is edited, and gives it back", () => {
      renderManager();
      fireEvent.click(screen.getAllByRole("button", { name: /Editar/ })[1]);

      const editor = screen.getByRole("form", { name: "Editar enlace" });
      expect(within(editor).getByLabelText("Título")).toBeTruthy();
      // Not an overlay: no dialog, and the lists are out of the way.
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByRole("region", { name: "Enlaces" })).toBeNull();
      expect(screen.queryByRole("region", { name: "Encabezado" })).toBeNull();
      expect(scrollTo).toHaveBeenCalledWith(0, 0);

      fireEvent.click(within(editor).getByRole("button", { name: "Cancelar" }));
      expect(screen.queryByRole("form")).toBeNull();
      expect(screen.getByRole("region", { name: "Enlaces" })).toBeTruthy();
    });

    it("keeps the preview in reach on a phone while editing", () => {
      renderManager();
      fireEvent.click(screen.getByRole("button", { name: "Nuevo enlace" }));
      fireEvent.change(screen.getByLabelText("Título"), {
        target: { value: "Entradas" },
      });
      fireEvent.change(screen.getByLabelText("Enlace"), {
        target: { value: "/entradas" },
      });

      // The button is live, not behind an overlay.
      fireEvent.click(screen.getByRole("button", { name: "Vista previa" }));
      expect(
        within(screen.getByRole("dialog")).getByRole("link", {
          name: "Entradas",
        }),
      ).toBeTruthy();
    });

    it("says why a link was refused next to the save button", async () => {
      actions.updateSiteLink.mockResolvedValue({
        success: false,
        message: "El enlace no es válido.",
      });
      renderManager();
      fireEvent.click(screen.getAllByRole("button", { name: /Editar/ })[1]);
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe("El enlace no es válido.");
      // In the bar that stays in view, with the button.
      const saveButton = await screen.findByRole(
        "button",
        { name: "Guardar" },
        { timeout: 5000 },
      );
      expect(alert.parentElement?.contains(saveButton)).toBe(true);
    });
  });

  describe("a link's schedule", () => {
    /** The preview, which on a phone is behind its floating button. */
    function previewed() {
      fireEvent.click(screen.getByRole("button", { name: /Vista previa/ }));
      const names = within(screen.getByRole("dialog"))
        .getAllByRole("link")
        .map((card) => card.getAttribute("aria-label") ?? card.textContent);
      fireEvent.click(
        screen.getByRole("button", { name: "Cerrar vista previa" }),
      );
      return names;
    }

    it("saves the dates a link is shown between, as typed", async () => {
      renderManager();
      fireEvent.click(screen.getByRole("button", { name: "Nuevo enlace" }));
      fireEvent.change(screen.getByLabelText("Título"), {
        target: { value: "Pre-registro" },
      });
      fireEvent.change(screen.getByLabelText("Enlace"), {
        target: { value: "/festivals" },
      });
      // Out of the way until it is asked for.
      expect(screen.queryByLabelText("Mostrar desde")).toBeNull();
      fireEvent.click(screen.getByRole("switch", { name: /Programar/ }));
      fireEvent.change(screen.getByLabelText("Mostrar desde"), {
        target: { value: "2026-11-20T09:00" },
      });
      fireEvent.change(screen.getByLabelText("Mostrar hasta"), {
        target: { value: "2026-11-30T23:59" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() =>
        expect(actions.createSiteLink).toHaveBeenCalledWith(
          expect.objectContaining({
            visibleFrom: "2026-11-20T09:00",
            visibleUntil: "2026-11-30T23:59",
          }),
        ),
      );
    });

    it("refuses an end that is not after the start, and saves no dates once switched off", async () => {
      renderManager();
      fireEvent.click(screen.getAllByRole("button", { name: /Editar/ })[1]);
      fireEvent.click(screen.getByRole("switch", { name: /Programar/ }));
      fireEvent.change(screen.getByLabelText("Mostrar desde"), {
        target: { value: "2026-11-20T09:00" },
      });
      fireEvent.change(screen.getByLabelText("Mostrar hasta"), {
        target: { value: "2026-11-20T09:00" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
      expect((await screen.findByRole("alert")).textContent).toMatch(
        /después de empezar/,
      );
      expect(actions.updateSiteLink).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("switch", { name: /Programar/ }));
      expect(screen.queryByLabelText("Mostrar desde")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
      await waitFor(() =>
        expect(actions.updateSiteLink).toHaveBeenCalledWith(
          1,
          expect.objectContaining({ visibleFrom: "", visibleUntil: "" }),
        ),
      );
    });

    it("opens a link on its dates in Bolivia's time, and says where it is in them", () => {
      renderManager([
        link({
          id: 7,
          label: "Por venir",
          // 20 November, 09:00 in Bolivia.
          visibleFrom: new Date("2026-11-20T13:00:00Z"),
        }),
        link({
          id: 8,
          label: "Terminado",
          sortOrder: 1,
          visibleUntil: new Date("2026-11-10T03:59:00Z"),
        }),
        link({
          id: 9,
          label: "En curso",
          sortOrder: 2,
          visibleFrom: new Date("2026-11-01T04:00:00Z"),
          visibleUntil: new Date("2026-11-30T04:00:00Z"),
        }),
      ]);
      expect(screen.getByText(/Se mostrará desde el 20 nov/)).toBeTruthy();
      expect(screen.getByText(/Dejó de mostrarse el 9 nov/)).toBeTruthy();
      expect(screen.getByText(/Se muestra hasta el 30 nov/)).toBeTruthy();
      // Only the one its schedule shows now is on the page.
      expect(previewed()).toEqual(["En curso"]);

      fireEvent.click(screen.getAllByRole("button", { name: /Editar/ })[0]);
      // A link with dates opens with them in view.
      expect(
        screen
          .getByRole("switch", { name: /Programar/ })
          .getAttribute("aria-checked"),
      ).toBe("true");
      expect(
        (screen.getByLabelText("Mostrar desde") as HTMLInputElement).value,
      ).toBe("2026-11-20T09:00");
      expect(
        (screen.getByLabelText("Mostrar hasta") as HTMLInputElement).value,
      ).toBe("");
    });
  });

  describe("the page's header", () => {
    const header = () =>
      within(screen.getByRole("region", { name: "Encabezado" }));

    it("starts on the stock header, with nothing to save", () => {
      renderManager();
      expect(
        (header().getByLabelText("Nombre") as HTMLInputElement).value,
      ).toBe("Productora Glitter");
      expect(
        (header().getByLabelText("Descripción") as HTMLTextAreaElement).value,
      ).toMatch(/^Productora de festivales/);
      expect(
        header()
          .getByRole("button", { name: "Guardar encabezado" })
          .hasAttribute("disabled"),
      ).toBe(true);
      expect(
        header().queryByRole("button", { name: "Volver al original" }),
      ).toBeNull();
    });

    it("shows the header in the preview as it is typed, and saves it", async () => {
      renderManager();
      fireEvent.change(header().getByLabelText("Nombre"), {
        target: { value: "Glitter Bolivia" },
      });
      fireEvent.change(header().getByLabelText("Descripción"), {
        target: { value: "" },
      });
      fireEvent.click(header().getByRole("button", { name: "Subir imagen" }));

      fireEvent.click(screen.getByRole("button", { name: /Vista previa/ }));
      const preview = within(screen.getByRole("dialog"));
      expect(preview.getByText("Glitter Bolivia")).toBeTruthy();
      expect(preview.queryByText(/^Productora de festivales/)).toBeNull();
      expect(actions.updateLinksHeader).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole("button", { name: "Cerrar vista previa" }),
      );

      fireEvent.click(
        header().getByRole("button", { name: "Guardar encabezado" }),
      );
      await waitFor(() =>
        expect(actions.updateLinksHeader).toHaveBeenCalledWith({
          title: "Glitter Bolivia",
          description: "",
          avatarUrl: "https://app.ufs.sh/f/subida",
        }),
      );
      await waitFor(() => expect(refresh).toHaveBeenCalled());
    });

    it("waits for an upload on its way before saving", () => {
      upload.hold = true;
      renderManager();
      const save = () =>
        header().getByRole("button", { name: "Guardar encabezado" });
      fireEvent.change(header().getByLabelText("Nombre"), {
        target: { value: "Glitter Bolivia" },
      });
      fireEvent.click(header().getByRole("button", { name: "Subir imagen" }));
      expect(save().hasAttribute("disabled")).toBe(true);
      fireEvent.submit(save().closest("form")!);
      expect(actions.updateLinksHeader).not.toHaveBeenCalled();

      act(() => upload.finish!());
      expect(save().hasAttribute("disabled")).toBe(false);
      expect(header().getByAltText("Imagen del encabezado")).toBeTruthy();
    });

    it("undoes what was typed, and goes back to the stock header", () => {
      const saved = {
        title: "Glitter Bolivia",
        description: "Festivales",
        avatarUrl: "https://app.ufs.sh/f/foto",
      };
      renderManager(LINKS, { initialHeader: saved });
      const name = () => header().getByLabelText("Nombre") as HTMLInputElement;

      fireEvent.change(name(), { target: { value: "Otro nombre" } });
      fireEvent.click(header().getByRole("button", { name: "Deshacer" }));
      expect(name().value).toBe("Glitter Bolivia");
      expect(header().getByAltText("Imagen del encabezado")).toBeTruthy();

      fireEvent.click(
        header().getByRole("button", { name: "Volver al original" }),
      );
      expect(name().value).toBe("Productora Glitter");
      expect(header().queryByAltText("Imagen del encabezado")).toBeNull();
    });

    it("keeps a header being edited when a refresh brings the same saved one", () => {
      const saved = {
        title: "Productora Glitter",
        description: "Festivales",
        avatarUrl: null,
      };
      const manager = (initialHeader: typeof saved, links = LINKS) => (
        <LinksManager
          initialLinks={links}
          initialHeader={initialHeader}
          publicUrl="https://www.glitter.com.bo/links"
          now={NOW.getTime()}
        />
      );
      const { rerender } = render(manager(saved));
      const name = () => header().getByLabelText("Nombre") as HTMLInputElement;
      fireEvent.change(name(), { target: { value: "Glitter Bolivia" } });
      fireEvent.click(header().getByRole("button", { name: "Subir imagen" }));

      // Something else was saved: the page comes back with a new list and the
      // same header, as a new object.
      rerender(manager({ ...saved }, [...LINKS]));
      expect(name().value).toBe("Glitter Bolivia");
      expect(header().getByAltText("Imagen del encabezado")).toBeTruthy();
      expect(
        header()
          .getByRole("button", { name: "Guardar encabezado" })
          .hasAttribute("disabled"),
      ).toBe(false);

      // A header that really changed is taken.
      rerender(manager({ ...saved, title: "Otro nombre" }));
      expect(name().value).toBe("Otro nombre");
    });

    it("keeps the fields and says why when the header is refused", async () => {
      actions.updateLinksHeader.mockResolvedValue({
        success: false,
        message: "El nombre es obligatorio.",
      });
      renderManager();
      fireEvent.change(header().getByLabelText("Nombre"), {
        target: { value: "Glitter" },
      });
      fireEvent.click(
        header().getByRole("button", { name: "Guardar encabezado" }),
      );

      expect((await header().findByRole("alert")).textContent).toBe(
        "El nombre es obligatorio.",
      );
      expect(
        (header().getByLabelText("Nombre") as HTMLInputElement).value,
      ).toBe("Glitter");
      expect(refresh).not.toHaveBeenCalled();
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
