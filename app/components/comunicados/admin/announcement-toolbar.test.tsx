// @vitest-environment jsdom

import { BlockNoteEditor } from "@blocknote/core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AnnouncementToolbar, {
  clampHeadingLevels,
} from "@/app/components/comunicados/admin/announcement-toolbar";
import RichTextEditorInner from "@/app/components/organisms/rich-text-editor-inner";
import { announcementEditorSchema } from "@/app/lib/rich-text/schemas";

function makeEditor(initialContent: unknown[] = []) {
  const editor = BlockNoteEditor.create({
    schema: announcementEditorSchema,
    initialContent:
      initialContent.length > 0 ? (initialContent as never) : undefined,
  });
  // Mounted, so selection and focus behave as in the composer.
  editor.mount(document.body.appendChild(document.createElement("div")));
  return editor;
}

function press(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

describe("AnnouncementToolbar", () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("offers exactly C1's nine controls, in order, and no strike", () => {
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

  /** A paste, as a browser hands it to the editor: data by MIME type. */
  function paste(data: Record<string, string>) {
    const target = document.querySelector('[contenteditable="true"]');
    if (!target) throw new Error("no editor");
    // jsdom has none; ProseMirror makes one for the paste it replays.
    vi.stubGlobal("ClipboardEvent", class ClipboardEvent extends Event {});
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        types: Object.keys(data),
        getData: (type: string) => data[type] ?? "",
      },
    });
    act(() => {
      target.dispatchEvent(event);
    });
  }

  async function mountEditor(variant: "announcement" | "article") {
    stubBrowser();
    const onChange = vi.fn();
    render(<RichTextEditorInner variant={variant} onChange={onChange} />);
    await waitFor(() =>
      expect(document.querySelector('[contenteditable="true"]')).toBeTruthy(),
    );
    return onChange;
  }

  type Doc = Array<{ type: string; props: { level?: number } }>;

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
