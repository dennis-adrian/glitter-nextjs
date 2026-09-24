import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
const { save, push } = vi.hoisted(() => ({
  save: vi.fn().mockResolvedValue({ success: true }),
  push: vi.fn(),
}));
vi.mock("@/app/lib/merch/actions", () => ({ saveMerchCollection: save }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
vi.mock("@/app/components/uploads/uploadthing-image-button", () => ({
  UploadThingImageButton: () => null,
}));
import CollectionForm from "./collection-form";
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("creates a non-festival collection with its own content, products and visibility", async () => {
  render(
    <CollectionForm
      festivalOptions={[{ id: 12, name: "Festival" }]}
      productOptions={[{ id: 3, name: "Polera" }]}
    />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Nombre" }), {
    target: { value: "Clásicos" },
  });
  fireEvent.change(
    screen.getByRole("textbox", { name: /Identificador de URL/ }),
    { target: { value: "clasicos" } },
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Descripción" }), {
    target: { value: "Favoritos de siempre" },
  });
  fireEvent.click(screen.getByLabelText("Polera"));
  fireEvent.change(
    screen.getByRole("textbox", { name: "URL del banner (opcional)" }),
    { target: { value: "/img/seed-merch/clasicos-campaign.png" } },
  );
  const preview = screen.getByRole("region", { name: "Colección Clásicos" });
  expect(preview.className).toContain("text-foreground");
  expect(screen.queryByRole("link", { name: "Explorar colección" })).toBeNull();
  fireEvent.keyDown(
    screen.getByRole("combobox", { name: "Contraste del banner" }),
    { key: "ArrowDown" },
  );
  fireEvent.click(
    screen.getByRole("option", { name: "Texto claro · imagen oscura" }),
  );
  expect(preview.className).toContain("text-white");
  expect(
    screen
      .getByRole("img", { name: "Campaña de Clásicos" })
      .getAttribute("src"),
  ).toContain("clasicos-campaign.png");
  expect(screen.getByRole("checkbox", { name: "Polera" }).tagName).toBe(
    "BUTTON",
  );
  expect(
    screen.getByRole("checkbox", { name: "Publicar en la tienda" }).tagName,
  ).toBe("BUTTON");
  fireEvent.click(screen.getByLabelText("Publicar en la tienda"));
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Mostrar en el banner principal" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Guardar colección" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Clásicos",
        slug: "clasicos",
        description: "Favoritos de siempre",
        campaignImageUrl: "/img/seed-merch/clasicos-campaign.png",
        campaignTextTone: "light",
        festivalId: null,
        productIds: [3],
        isVisible: true,
        showInHero: true,
        sortOrder: 1,
      }),
    ),
  );
  await waitFor(() =>
    expect(push).toHaveBeenCalledWith("/dashboard/store/collections"),
  );
});

it("keeps edits on screen when the server rejects a duplicate URL", async () => {
  save.mockResolvedValueOnce({ success: false, message: "La URL ya existe." });
  render(
    <CollectionForm
      collection={{
        id: 7,
        name: "Clásicos",
        slug: "clasicos",
        description: "",
        imageUrl: "",
        festivalId: 12,
        isVisible: false,
        sortOrder: 2,
        productIds: [],
      }}
      festivalOptions={[{ id: 12, name: "Festival" }]}
      productOptions={[]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Guardar colección" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe("La URL ya existe."),
  );
  expect(push).not.toHaveBeenCalled();
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ id: 7, festivalId: 12, isVisible: false }),
  );
  expect(
    screen.getByRole("region", { name: "Colección Clásicos" }).className,
  ).toContain("bg-brand-lavender");
});

it("changes the optional festival with the shared selector", async () => {
  render(
    <CollectionForm
      collection={{
        id: 7,
        name: "Clásicos",
        slug: "clasicos",
        description: "",
        imageUrl: "",
        festivalId: 12,
        isVisible: false,
        sortOrder: 2,
        productIds: [],
      }}
      festivalOptions={[{ id: 12, name: "Festival" }]}
      productOptions={[]}
    />,
  );
  fireEvent.keyDown(
    screen.getByRole("combobox", { name: "Festival relacionado (opcional)" }),
    { key: "ArrowDown" },
  );
  fireEvent.click(screen.getByRole("option", { name: "Sin festival" }));
  fireEvent.click(screen.getByRole("button", { name: "Guardar colección" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, festivalId: null }),
    ),
  );
});

it("finds products in a large catalog without losing existing selections", async () => {
  render(
    <CollectionForm
      collection={{
        id: 7,
        name: "Clásicos",
        slug: "clasicos",
        description: "",
        imageUrl: "",
        festivalId: null,
        isVisible: true,
        sortOrder: 1,
        productIds: [1],
      }}
      festivalOptions={[]}
      productOptions={Array.from({ length: 100 }, (_, index) => ({
        id: index + 1,
        name: `Artículo ${index + 1}`,
      }))}
    />,
  );

  fireEvent.change(
    screen.getByRole("searchbox", { name: "Buscar productos" }),
    {
      target: { value: "articulo 100" },
    },
  );
  expect(screen.getByRole("checkbox", { name: "Artículo 1" })).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: "Artículo 100" })).toBeTruthy();
  expect(screen.queryByRole("checkbox", { name: "Artículo 2" })).toBeNull();

  fireEvent.click(screen.getByRole("checkbox", { name: "Artículo 100" }));
  expect(screen.getByText("Seleccionados (2)")).toBeTruthy();
  expect(
    screen.getByText("Ya seleccionaste todos los productos encontrados."),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "Artículo 1" }));
  expect(screen.getByText("Seleccionados (1)")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Guardar colección" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ productIds: [100] }),
    ),
  );
});
