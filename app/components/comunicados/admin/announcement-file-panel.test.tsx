// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnnouncementUploadTab } from "@/app/components/comunicados/admin/announcement-file-panel";
import RichTextEditorInner from "@/app/components/organisms/rich-text-editor-inner";
import { COMUNICADO_IMAGE_HELP } from "@/app/lib/comunicados/definitions";
import { COMUNICADO_IMAGE_CAP_MESSAGE } from "@/app/lib/comunicados/images";

/** The upload panel, as the comunicado editor opens it (C4). */

const fake = vi.hoisted(() => ({ editor: null as unknown }));

// The real hook everywhere, unless a test hands the tab an editor of its
// own: some moments (a block removed mid-upload) are out of reach of the
// mounted editor.
vi.mock("@blocknote/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@blocknote/react")>();
  return {
    ...actual,
    useBlockNoteEditor: (...args: unknown[]) =>
      fake.editor ??
      (actual.useBlockNoteEditor as (...a: unknown[]) => unknown)(...args),
  };
});

function stubBrowser() {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: true,
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  );
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
}

type Doc = Array<{ type: string; props: { url?: string } }>;

function image(key: string) {
  return { type: "image", props: { url: `https://abc.ufs.sh/f/${key}` } };
}

async function openPanel(
  uploadFile: (file: File) => Promise<string>,
  initialContent: unknown[] = [{ type: "paragraph", content: "Hola" }],
) {
  stubBrowser();
  const onChange = vi.fn();
  render(
    <RichTextEditorInner
      variant="announcement"
      initialContent={initialContent}
      onChange={onChange}
      uploadFile={uploadFile}
    />,
  );
  await waitFor(() =>
    expect(document.querySelector('[contenteditable="true"]')).toBeTruthy(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Imagen" }));
  await waitFor(() => expect(screen.getByText(COMUNICADO_IMAGE_HELP)));
  return onChange;
}

function pick(file: File) {
  fireEvent.change(screen.getByLabelText("Archivo de imagen"), {
    target: { files: [file] },
  });
}

const PNG = new File(["png"], "plano.png", { type: "image/png" });

describe("AnnouncementFilePanel", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fake.editor = null;
  });

  it("offers an upload alone, of JPEG and PNG, with the size advice", async () => {
    await openPanel(vi.fn());

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Subir",
    ]);
    const input = screen.getByLabelText(
      "Archivo de imagen",
    ) as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.accept).toBe("image/jpeg,image/png");
    // No field takes an address from another site.
    expect(document.querySelector('input:not([type="file"])')).toBeNull();
  });

  it("puts the uploaded address in the image and closes", async () => {
    const uploadFile = vi.fn(async () => "https://abc.ufs.sh/f/PLANO");
    const onChange = await openPanel(uploadFile);

    pick(PNG);
    await waitFor(() =>
      expect(screen.queryByText(COMUNICADO_IMAGE_HELP)).toBeNull(),
    );
    // With no block id, so BlockNote never swaps the image's button for
    // "Loading...".
    expect(uploadFile).toHaveBeenCalledWith(PNG, undefined);
    const [doc] = onChange.mock.calls.at(-1) as [Doc];
    expect(doc.find((block) => block.type === "image")?.props).toMatchObject({
      url: "https://abc.ufs.sh/f/PLANO",
    });
  });

  it("says it is uploading, and keeps the panel shut to a second pick", async () => {
    let finish: (url: string) => void = () => {};
    const uploadFile = vi.fn(
      () => new Promise<string>((resolve) => (finish = resolve)),
    );
    await openPanel(uploadFile);

    pick(PNG);
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByText("Subiendo la imagen…")).toBeTruthy();
    expect(
      (screen.getByLabelText("Archivo de imagen") as HTMLInputElement).disabled,
    ).toBe(true);

    finish("https://abc.ufs.sh/f/PLANO");
    await waitFor(() =>
      expect(screen.queryByText(COMUNICADO_IMAGE_HELP)).toBeNull(),
    );
  });

  it("shows the upload's refusal and lets another file be picked", async () => {
    const uploadFile = vi
      .fn()
      .mockRejectedValueOnce(new Error("La imagen pesa más de 4 MB."))
      .mockResolvedValueOnce("https://abc.ufs.sh/f/PLANO");
    const onChange = await openPanel(uploadFile);

    pick(PNG);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "La imagen pesa más de 4 MB.",
    );
    // The image waits, empty, for the next pick, with its own button back:
    // BlockNote leaves "Loading..." after a failure, and a second upload
    // into that block would throw before it started.
    const [doc] = onChange.mock.calls.at(-1) as [Doc];
    expect(doc.find((block) => block.type === "image")?.props.url).toBe("");
    expect(document.querySelector(".bn-add-file-button")).toBeTruthy();
    expect(screen.queryByText("Loading...")).toBeNull();

    pick(PNG);
    await waitFor(() =>
      expect(screen.queryByText(COMUNICADO_IMAGE_HELP)).toBeNull(),
    );
    expect(uploadFile).toHaveBeenCalledTimes(2);
  });

  it("uploads nothing past six images", async () => {
    stubBrowser();
    const uploadFile = vi.fn(async () => "https://abc.ufs.sh/f/SIETE");
    render(
      <RichTextEditorInner
        variant="announcement"
        // Six images and one placeholder: "Imagen" is off, but an empty
        // image's own button still opens the panel.
        initialContent={[
          ...["UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS"].map(image),
          { type: "image" },
        ]}
        uploadFile={uploadFile}
      />,
    );
    const placeholder = await waitFor(() => {
      const button = document.querySelector(".bn-add-file-button");
      if (!button) throw new Error("no placeholder");
      return button;
    });
    expect(
      (screen.getByRole("button", { name: "Imagen" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(placeholder);
    await waitFor(() => expect(screen.getByText(COMUNICADO_IMAGE_HELP)));
    pick(PNG);
    expect((await screen.findByRole("alert")).textContent).toBe(
      COMUNICADO_IMAGE_CAP_MESSAGE,
    );
    expect(uploadFile).not.toHaveBeenCalled();
  });

  describe("with an editor of its own", () => {
    function tabFor(editor: Record<string, unknown>) {
      fake.editor = { document: [], getBlock: () => ({ id: "b1" }), ...editor };
      render(<AnnouncementUploadTab blockId="b1" />);
    }

    it("leaves alone an image removed while it uploaded", async () => {
      const updateBlock = vi.fn();
      tabFor({
        uploadFile: async () => "https://abc.ufs.sh/f/PLANO",
        getBlock: () => undefined,
        updateBlock,
      });

      pick(PNG);
      await waitFor(() =>
        expect(
          (screen.getByLabelText("Archivo de imagen") as HTMLInputElement)
            .disabled,
        ).toBe(false),
      );
      expect(updateBlock).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("takes nothing but an address from the upload", async () => {
      const updateBlock = vi.fn();
      tabFor({ uploadFile: async () => ({ props: {} }), updateBlock });

      pick(PNG);
      expect((await screen.findByRole("alert")).textContent).toBe(
        "No se pudo subir la imagen.",
      );
      expect(updateBlock).not.toHaveBeenCalled();
    });

    it("offers no file to pick without an upload", () => {
      tabFor({ uploadFile: undefined });
      expect(
        (screen.getByLabelText("Archivo de imagen") as HTMLInputElement)
          .disabled,
      ).toBe(true);
    });
  });
});
