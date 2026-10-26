// @vitest-environment jsdom

import { BlockNoteEditor } from "@blocknote/core";
import { FilePanelExtension } from "@blocknote/core/extensions";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import AnnouncementToolbar, {
  clampHeadingLevels,
  tabWouldNestTooDeep,
} from "@/app/components/comunicados/admin/announcement-toolbar";
import { COMUNICADO_IMAGE_TYPE_MESSAGE } from "@/app/components/comunicados/admin/use-comunicado-image-upload";
import RichTextEditorInner from "@/app/components/organisms/rich-text-editor-inner";
import { announcementEditorSchema } from "@/app/lib/rich-text/schemas";

function makeEditor(
  initialContent: unknown[] = [],
  uploadFile?: (file: File) => Promise<string>,
) {
  const editor = BlockNoteEditor.create({
    schema: announcementEditorSchema,
    initialContent:
      initialContent.length > 0 ? (initialContent as never) : undefined,
    uploadFile,
  });
  // Mounted, so selection and focus behave as in the composer.
  editor.mount(document.body.appendChild(document.createElement("div")));
  return editor;
}

function press(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

const uploadFile = async () => "https://abc.ufs.sh/f/KEY";

function image(key: string) {
  return {
    type: "image" as const,
    props: { url: `https://abc.ufs.sh/f/${key}` },
  };
}

/** Selects from the end of one text to the start of another. */
function selectBetween(
  editor: ReturnType<typeof makeEditor>,
  from: string,
  to: string,
) {
  let start = 0;
  let end = 0;
  editor.prosemirrorState.doc.descendants((node, pos) => {
    if (node.text === from) start = pos + node.nodeSize;
    if (node.text === to) end = pos;
  });
  editor._tiptapEditor.commands.setTextSelection({ from: start, to: end });
}

function imageButton() {
  return screen.getByRole("button", { name: "Imagen" }) as HTMLButtonElement;
}

describe("AnnouncementToolbar", () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("offers exactly C1's ten controls, in order, and no strike", () => {
    render(<AnnouncementToolbar editor={makeEditor()} />);

    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Negrita",
      "Cursiva",
      "Enlace",
      "Título",
      "Subtítulo",
      "Lista",
      "Lista numerada",
      "Cita",
      "Separador",
      "Imagen",
    ]);
  });

  it("turns the current line into a heading, and back on a second press", () => {
    const editor = makeEditor([{ type: "paragraph", content: "Horario" }]);
    editor.setTextCursorPosition(editor.document[0], "end");
    render(<AnnouncementToolbar editor={editor} />);

    press("Título");
    expect(editor.document[0]).toMatchObject({
      type: "heading",
      props: { level: 2 },
    });
    expect(
      screen
        .getByRole("button", { name: "Título" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    press("Subtítulo");
    expect(editor.document[0]).toMatchObject({
      type: "heading",
      props: { level: 3 },
    });

    press("Subtítulo");
    expect(editor.document[0].type).toBe("paragraph");
  });

  it("shows a pasted h1 as Título and an h4 as Subtítulo, as they are saved", async () => {
    const editor = makeEditor([
      { type: "heading", props: { level: 1 }, content: "Grande" },
      { type: "heading", props: { level: 4 }, content: "Chico" },
    ]);
    const pressed = (label: string) =>
      screen.getByRole("button", { name: label }).getAttribute("aria-pressed");
    editor.setTextCursorPosition(editor.document[0], "end");
    render(<AnnouncementToolbar editor={editor} />);
    expect(pressed("Título")).toBe("true");
    expect(pressed("Subtítulo")).toBe("false");

    // Repaired from the toolbar: Título on the h4 makes it a level-2 heading.
    act(() => editor.setTextCursorPosition(editor.document[1], "end"));
    await waitFor(() => expect(pressed("Subtítulo")).toBe("true"));
    press("Título");
    expect(editor.document[1]).toMatchObject({
      type: "heading",
      props: { level: 2 },
    });
  });

  it("gives every heading its saved level at once", () => {
    const editor = makeEditor([
      { type: "heading", props: { level: 1 }, content: "Uno" },
      {
        type: "paragraph",
        content: "Dos",
        children: [{ type: "heading", props: { level: 6 }, content: "Seis" }],
      },
      { type: "heading", props: { level: 3 }, content: "Tres" },
    ]);

    clampHeadingLevels(editor);
    expect(editor.document[0].props).toMatchObject({ level: 2 });
    expect(editor.document[1].children[0].props).toMatchObject({ level: 3 });
    expect(editor.document[2].props).toMatchObject({ level: 3 });
  });

  it("makes lists and quotes from the current line", () => {
    const editor = makeEditor([{ type: "paragraph", content: "Mesa" }]);
    editor.setTextCursorPosition(editor.document[0], "end");
    render(<AnnouncementToolbar editor={editor} />);

    press("Lista");
    expect(editor.document[0].type).toBe("bulletListItem");
    press("Lista numerada");
    expect(editor.document[0].type).toBe("numberedListItem");
    press("Cita");
    expect(editor.document[0].type).toBe("quote");
  });

  it("inserts a divider below the line and keeps a line to write on", () => {
    const editor = makeEditor([{ type: "paragraph", content: "Antes" }]);
    editor.setTextCursorPosition(editor.document[0], "end");
    render(<AnnouncementToolbar editor={editor} />);

    press("Separador");
    const types = editor.document.map((block) => block.type);
    expect(types.slice(0, 2)).toEqual(["paragraph", "divider"]);
    expect(types.at(-1)).toBe("paragraph");
  });

  it("inserts an image below the line and opens the upload panel on it", () => {
    const editor = makeEditor(
      [{ type: "paragraph", content: "Antes" }],
      uploadFile,
    );
    editor.setTextCursorPosition(editor.document[0], "end");
    render(<AnnouncementToolbar editor={editor} />);

    press("Imagen");
    const types = editor.document.map((block) => block.type);
    expect(types.slice(0, 2)).toEqual(["paragraph", "image"]);
    // A line to keep writing on, as after a divider.
    expect(types.at(-1)).toBe("paragraph");
    expect(editor.getExtension(FilePanelExtension)?.store.state).toBe(
      editor.document[1].id,
    );
  });

  it("puts the image on an empty line instead of below it", () => {
    const editor = makeEditor([{ type: "paragraph", content: "" }], uploadFile);
    editor.setTextCursorPosition(editor.document[0], "end");
    render(<AnnouncementToolbar editor={editor} />);

    press("Imagen");
    expect(editor.document[0]).toMatchObject({
      type: "image",
      props: { url: "" },
    });
  });

  it("adds an image after the image the cursor is on", () => {
    const editor = makeEditor([image("UNO")], uploadFile);
    editor.setTextCursorPosition(editor.document[0]);
    render(<AnnouncementToolbar editor={editor} />);

    press("Imagen");
    expect(editor.document[0].props).toMatchObject({
      url: "https://abc.ufs.sh/f/UNO",
    });
    expect(editor.document[1]).toMatchObject({
      type: "image",
      props: { url: "" },
    });
  });

  it("offers no image once the comunicado has six", async () => {
    const editor = makeEditor(
      ["UNO", "DOS", "TRES", "CUATRO", "CINCO"].map(image),
      uploadFile,
    );
    render(<AnnouncementToolbar editor={editor} />);
    expect(imageButton().disabled).toBe(false);

    act(() => {
      editor.insertBlocks([image("SEIS")], editor.document[4], "after");
    });
    await waitFor(() => expect(imageButton().disabled).toBe(true));

    // One with no address yet (an upload under way) is not an image.
    act(() => {
      editor.removeBlocks([editor.document[5]]);
      editor.insertBlocks([{ type: "image" }], editor.document[4], "after");
    });
    await waitFor(() => expect(imageButton().disabled).toBe(false));
  });

  it("offers no image without an upload", () => {
    render(<AnnouncementToolbar editor={makeEditor()} />);
    expect(imageButton().disabled).toBe(true);
  });

  it("leaves an image as it is under Título, Lista or Cita", () => {
    const editor = makeEditor(
      [image("PLANO"), { type: "paragraph", content: "Después" }],
      uploadFile,
    );
    editor.setTextCursorPosition(editor.document[0]);
    render(<AnnouncementToolbar editor={editor} />);
    const before = JSON.stringify(editor.document);

    for (const label of ["Título", "Subtítulo", "Lista", "Cita"]) {
      press(label);
    }
    expect(JSON.stringify(editor.document)).toBe(before);
  });

  it.each([
    [
      "selected, as a click on it does",
      (editor: ReturnType<typeof makeEditor>) =>
        editor.setTextCursorPosition(editor.document[1]),
    ],
    [
      "inside a selection with no text",
      (editor: ReturnType<typeof makeEditor>) =>
        selectBetween(editor, "Antes", "Después"),
    ],
  ])("leaves an image %s as it is under Enlace", (_how, select) => {
    const editor = makeEditor(
      [
        { type: "paragraph", content: "Antes" },
        image("PLANO"),
        { type: "paragraph", content: "Después" },
      ],
      uploadFile,
    );
    const prompt = vi
      .spyOn(window, "prompt")
      .mockReturnValue("https://glitter.example/x");
    render(<AnnouncementToolbar editor={editor} />);
    const before = JSON.stringify(editor.document);

    act(() => select(editor));
    press("Enlace");
    // The link's text would replace the image: nothing is asked.
    expect(prompt).not.toHaveBeenCalled();
    expect(JSON.stringify(editor.document)).toBe(before);
  });

  it("styles everything selected even when it starts at an image", () => {
    const editor = makeEditor(
      [image("PLANO"), { type: "paragraph", content: "Después" }],
      uploadFile,
    );
    render(<AnnouncementToolbar editor={editor} />);
    // Select all, as Ctrl+A does: the image is the block "under the cursor".
    act(() => {
      editor._tiptapEditor.commands.selectAll();
    });
    expect(editor.prosemirrorState.selection.toJSON()).toEqual({
      type: "all",
    });
    expect(editor.getTextCursorPosition().block.type).toBe("image");

    press("Negrita");
    expect(editor.document[0].props).toMatchObject({
      url: "https://abc.ufs.sh/f/PLANO",
    });
    expect(editor.document[1].content).toEqual([
      { type: "text", text: "Después", styles: { bold: true } },
    ]);
  });

  it("links the typed address, as its own text when nothing is selected", () => {
    const editor = makeEditor([{ type: "paragraph", content: "" }]);
    editor.setTextCursorPosition(editor.document[0], "end");
    vi.spyOn(window, "prompt").mockReturnValue(
      " https://productoraglitter.com ",
    );
    render(<AnnouncementToolbar editor={editor} />);

    press("Enlace");
    expect(editor.document[0].content).toEqual([
      {
        type: "link",
        href: "https://productoraglitter.com",
        content: [
          { type: "text", text: "https://productoraglitter.com", styles: {} },
        ],
      },
    ]);
  });

  it("toggles bold and italic on the selection", () => {
    const editor = makeEditor([
      { type: "paragraph", content: "Hola" },
      { type: "paragraph", content: "Chau" },
    ]);
    editor.setSelection(editor.document[0], editor.document[1]);
    render(<AnnouncementToolbar editor={editor} />);

    press("Negrita");
    press("Cursiva");
    for (const block of editor.document.slice(0, 2)) {
      expect(block.content).toEqual([
        {
          type: "text",
          text: expect.any(String),
          styles: { bold: true, italic: true },
        },
      ]);
    }
    expect(
      screen
        .getByRole("button", { name: "Negrita" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("stops Tab at the second list level", () => {
    const editor = makeEditor([
      {
        type: "bulletListItem",
        content: "Uno",
        children: [{ type: "bulletListItem", content: "Dos" }],
      },
      { type: "paragraph", content: "Tres" },
    ]);
    // "Uno" would take "Dos" a level down with it.
    editor.setTextCursorPosition(editor.document[0], "end");
    expect(tabWouldNestTooDeep(editor)).toBe(true);
    editor.setTextCursorPosition(editor.document[0].children[0], "end");
    expect(tabWouldNestTooDeep(editor)).toBe(true);
    editor.setTextCursorPosition(editor.document[1], "end");
    expect(tabWouldNestTooDeep(editor)).toBe(false);
  });

  it("stops Tab on a top-level block whose children would sink to a third level", () => {
    const editor = makeEditor([
      { type: "bulletListItem", content: "Arriba" },
      {
        type: "bulletListItem",
        content: "Uno",
        children: [{ type: "bulletListItem", content: "Dos" }],
      },
    ]);
    // "Uno" has no parent, but Tab would take "Dos" with it, one level down.
    editor.setTextCursorPosition(editor.document[1], "end");
    expect(tabWouldNestTooDeep(editor)).toBe(true);
  });

  it("disables every control when the editor is read-only", () => {
    render(<AnnouncementToolbar editor={makeEditor()} readOnly />);
    for (const button of screen.getAllByRole("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });
});

describe("RichTextEditorInner, announcement variant", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  it("mounts with the comunicado toolbar and reports blocks of its schema", async () => {
    stubBrowser();
    const onChange = vi.fn();
    render(
      <RichTextEditorInner
        variant="announcement"
        initialContent={[{ type: "paragraph", content: "Hola" }]}
        onChange={onChange}
      />,
    );

    expect(
      screen.getByRole("toolbar", { name: "Formato del texto" }),
    ).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Hola")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Separador" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const [doc] = onChange.mock.calls.at(-1) as [Array<{ type: string }>];
    expect(doc.map((block) => block.type)).toContain("divider");
  });

  /**
   * A paste, as a browser hands it to the editor: data by MIME type, and
   * any files, such as a screenshot.
   */
  function paste(data: Record<string, string>, files: File[] = []) {
    const target = document.querySelector('[contenteditable="true"]');
    if (!target) throw new Error("no editor");
    // jsdom has none; ProseMirror makes one for the paste it replays.
    vi.stubGlobal("ClipboardEvent", class ClipboardEvent extends Event {});
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        types: [...Object.keys(data), ...(files.length > 0 ? ["Files"] : [])],
        getData: (type: string) => data[type] ?? "",
        items: files.map((file) => ({
          kind: "file",
          type: file.type,
          getAsFile: () => file,
        })),
      },
    });
    act(() => {
      target.dispatchEvent(event);
    });
  }

  /** The clipboard or drag data a browser hands over, as BlockNote reads it. */
  function transfer(data: Record<string, string>, files: File[] = []) {
    return {
      types: [...Object.keys(data), ...(files.length > 0 ? ["Files"] : [])],
      getData: (type: string) => data[type] ?? "",
      items: files.map((file) => ({
        kind: "file",
        type: file.type,
        getAsFile: () => file,
      })),
    };
  }

  /**
   * A drop on the first block, from another window: jsdom has no layout, so
   * the editor is told where it landed.
   */
  function drop(data: Record<string, string>, files: File[] = []) {
    const target = document.querySelector('[contenteditable="true"]');
    if (!target) throw new Error("no editor");
    const view = (
      target as unknown as {
        editor: { view: { posAtCoords: () => unknown } };
      }
    ).editor.view;
    view.posAtCoords = () => ({ pos: 1, inside: -1 });
    vi.stubGlobal("ClipboardEvent", class ClipboardEvent extends Event {});
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: transfer(data, files),
    });
    Object.assign(event, { clientX: 1, clientY: 1 });
    act(() => {
      target.dispatchEvent(event);
    });
    return event;
  }

  function pdf() {
    return new File(["%PDF"], "plano.pdf", { type: "application/pdf" });
  }

  function png() {
    return new File(["png"], "plano.png", { type: "image/png" });
  }

  type Block = {
    type: string;
    props: { level?: number };
    content?: { text?: string }[];
  };

  /** Each block's type and text, from the last document reported. */
  function blocksOf(onChange: ReturnType<typeof vi.fn>) {
    const [doc] = onChange.mock.calls.at(-1) as [Block[]];
    return doc.map((block) => [
      block.type,
      (block.content ?? []).map((part) => part.text ?? "").join(""),
    ]);
  }

  async function mountEditor(
    variant: "announcement" | "article",
    uploadFile?: (file: File) => Promise<string>,
  ) {
    stubBrowser();
    const onChange = vi.fn();
    render(
      <RichTextEditorInner
        variant={variant}
        onChange={onChange}
        uploadFile={uploadFile}
      />,
    );
    await waitFor(() =>
      expect(document.querySelector('[contenteditable="true"]')).toBeTruthy(),
    );
    return onChange;
  }

  type Doc = Array<{ type: string; props: { level?: number; url?: string } }>;

  it.each([
    [
      "HTML",
      {
        "text/html": "<h1>Grande</h1><h4>Chico</h4><h6>Mínimo</h6>",
        "text/plain": "Grande Chico Mínimo",
      },
    ],
    [
      "Markdown",
      { "text/plain": "# Grande\n\n#### Chico\n\n###### Mínimo\n\nTexto" },
    ],
  ])(
    "saves a heading pasted from %s as Título or Subtítulo in the editor too",
    async (_format, clipboard) => {
      const onChange = await mountEditor("announcement");

      paste(clipboard);
      await waitFor(() => expect(onChange).toHaveBeenCalled());
      const [doc] = onChange.mock.calls.at(-1) as [Doc];
      expect(
        doc
          .filter((block) => block.type === "heading")
          .map((block) => block.props.level),
      ).toEqual([2, 3, 3]);
    },
  );

  it("puts a pasted image's address in it", async () => {
    const uploadFile = vi.fn(async () => "https://abc.ufs.sh/f/FOTO");
    const onChange = await mountEditor("announcement", uploadFile);

    paste({}, [new File(["png"], "foto.png", { type: "image/png" })]);
    await waitFor(() => {
      const [doc] = onChange.mock.calls.at(-1) as [Doc];
      expect(doc.find((block) => block.type === "image")?.props.url).toBe(
        "https://abc.ufs.sh/f/FOTO",
      );
    });
  });

  it("turns a pasted image the upload refused back into an empty line", async () => {
    // The hook has toasted the refusal by the time it throws.
    const uploadFile = vi.fn(async (): Promise<string> => {
      throw new Error("Subí una imagen JPG o PNG.");
    });
    const onChange = await mountEditor("announcement", uploadFile);

    paste({}, [new File(["webp"], "foto.webp", { type: "image/webp" })]);
    await waitFor(() => expect(uploadFile).toHaveBeenCalled());
    await waitFor(() => {
      const [doc] = onChange.mock.calls.at(-1) as [Doc];
      expect(doc.map((block) => block.type)).not.toContain("image");
    });
    // BlockNote's "Loading..." would otherwise stay, with no button left.
    expect(document.querySelector(".bn-file-loading-preview")).toBeNull();
  });

  it.each([
    ["a PDF", [pdf()]],
    ["a PDF before an image", [pdf(), png()]],
    ["an image before a PDF", [png(), pdf()]],
  ])(
    "refuses a pasted file that is not an image, saying why: %s",
    async (_label, files) => {
      const error = vi.spyOn(toast, "error");
      const uploadFile = vi.fn(async () => "https://abc.ufs.sh/f/FOTO");
      const onChange = await mountEditor("announcement", uploadFile);

      paste({}, files);
      // BlockNote would make a "file" block, which a comunicado does not
      // have, and fail after taking the paste.
      await act(async () => {});
      expect(error).toHaveBeenCalledWith(COMUNICADO_IMAGE_TYPE_MESSAGE);
      expect(uploadFile).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it("refuses a dropped file that is not an image, saying why", async () => {
    const error = vi.spyOn(toast, "error");
    const uploadFile = vi.fn(async () => "https://abc.ufs.sh/f/FOTO");
    const onChange = await mountEditor("announcement", uploadFile);

    const event = drop({}, [pdf(), png()]);
    await act(async () => {});
    expect(event.defaultPrevented).toBe(true);
    expect(error).toHaveBeenCalledWith(COMUNICADO_IMAGE_TYPE_MESSAGE);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("still pastes the text of a copy that also carries a file", async () => {
    // Word and some sites add a picture of the selection: BlockNote pastes
    // the HTML.
    const error = vi.spyOn(toast, "error");
    const onChange = await mountEditor("announcement", uploadFile);

    paste({ "text/html": "<p>Llegá temprano</p>" }, [pdf()]);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(blocksOf(onChange)[0]).toEqual(["paragraph", "Llegá temprano"]);
    expect(error).not.toHaveBeenCalled();
  });

  it("gives dropped headings their saved level too, and one undo takes the drop back", async () => {
    const onChange = await mountEditor("announcement");

    drop({ "text/html": "<h1>Grande</h1><h5>Chico</h5>" });
    await waitFor(() => {
      const [doc] = onChange.mock.calls.at(-1) as [Block[]];
      expect(
        doc
          .filter((block) => block.type === "heading")
          .map((block) => block.props.level),
      ).toEqual([2, 3]);
    });

    const text = document.querySelector('[contenteditable="true"]')!;
    act(() => {
      fireEvent.keyDown(text, { key: "z", ctrlKey: true });
    });
    await waitFor(() =>
      expect(blocksOf(onChange).map(([type]) => type)).not.toContain("heading"),
    );
  });

  it("pastes a spreadsheet's rows as lines, its cells apart", async () => {
    const onChange = await mountEditor("announcement");

    paste({
      "text/html":
        "<google-sheets-html-origin><table><tbody><tr><td>Mesa 1</td><td>10:00</td></tr><tr><td>Mesa 2</td><td> </td><td>11:00</td></tr></tbody></table></google-sheets-html-origin>",
      "text/plain": "Mesa 1\t10:00\nMesa 2\t\t11:00",
    });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(blocksOf(onChange)).toEqual([
      ["paragraph", "Mesa 1 · 10:00"],
      ["paragraph", "Mesa 2 · 11:00"],
    ]);
  });

  it("pastes a Markdown table's rows as lines, and leaves what is around a table as it was", async () => {
    const onChange = await mountEditor("announcement");

    paste({ "text/plain": "| Mesa | Hora |\n|---|---|\n| 1 | 10:00 |" });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(blocksOf(onChange).slice(0, 2)).toEqual([
      ["paragraph", "Mesa · Hora"],
      ["paragraph", "1 · 10:00"],
    ]);
    cleanup();

    const again = await mountEditor("announcement");
    paste({
      "text/html":
        "<h2>Horarios</h2><table><tr><th>Mesa</th><th>Hora</th></tr><tr><td>1</td><td>10:00</td></tr></table><p>Llegá <strong>temprano</strong>.</p>",
      "text/plain": "Horarios\nMesa\tHora\n1\t10:00\nLlegá temprano.",
    });
    await waitFor(() => expect(again).toHaveBeenCalled());
    expect(blocksOf(again)).toEqual([
      ["heading", "Horarios"],
      ["paragraph", "Mesa · Hora"],
      ["paragraph", "1 · 10:00"],
      ["paragraph", "Llegá temprano."],
    ]);
  });

  it("offers no resize handle on an image: a comunicado keeps no size", async () => {
    await mountEditor("announcement");
    const wrapper = screen.getByRole("toolbar", {
      name: "Formato del texto",
    }).parentElement!;
    expect(wrapper.className).toContain("[&_.bn-resize-handle]:!hidden");
  });

  it("stops Tab only inside the text, never on the toolbar", async () => {
    stubBrowser();
    render(
      <RichTextEditorInner
        variant="announcement"
        // The cursor opens in "Uno": Tab there would sink "Dos" a level.
        initialContent={[
          {
            type: "bulletListItem",
            content: "Uno",
            children: [{ type: "bulletListItem", content: "Dos" }],
          },
        ]}
      />,
    );
    await waitFor(() => expect(screen.getByText("Dos")).toBeTruthy());
    const text = document.querySelector('[contenteditable="true"]')!;

    // fireEvent answers false when the event's default was prevented.
    expect(fireEvent.keyDown(text, { key: "Tab" })).toBe(false);
    expect(
      fireEvent.keyDown(screen.getByRole("button", { name: "Negrita" }), {
        key: "Tab",
      }),
    ).toBe(true);
  });

  it("keeps a pasted h1 in the other variants", async () => {
    const onChange = await mountEditor("article");

    paste({ "text/html": "<h1>Grande</h1>" });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const [doc] = onChange.mock.calls.at(-1) as [Doc];
    expect(doc[0]).toMatchObject({ type: "heading", props: { level: 1 } });
  });

  it("leaves the other variants without it", () => {
    stubBrowser();
    render(<RichTextEditorInner variant="compact" />);
    expect(
      screen.queryByRole("toolbar", { name: "Formato del texto" }),
    ).toBeNull();
  });
});
