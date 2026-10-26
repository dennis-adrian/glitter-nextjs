// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MessageCard, {
  type ActionFields,
} from "@/app/components/comunicados/admin/composer/message-card";

const editor = vi.hoisted(() => ({
  emit: null as null | ((doc: unknown) => void),
  uploadFile: undefined as undefined | ((file: File) => Promise<string>),
}));
const uploads = vi.hoisted(() => ({
  endpoint: null as string | null,
  startUpload: vi.fn(),
}));

// BlockNote does not run in jsdom: a stand-in that can report a change, as
// the real editor does on mount and on input.
vi.mock("@/app/components/organisms/rich-text-editor", () => ({
  default: (props: {
    onChange?: (json: unknown, html: string) => void;
    uploadFile?: (file: File) => Promise<string>;
  }) => {
    editor.emit = (doc) => props.onChange?.(doc, "");
    editor.uploadFile = props.uploadFile;
    return <div contentEditable data-testid="editor" />;
  },
}));
vi.mock("@/app/vendors/uploadthing", () => ({
  useUploadThing: (endpoint: string) => {
    uploads.endpoint = endpoint;
    return { startUpload: uploads.startUpload, isUploading: false };
  },
}));

function Harness({
  initialAction = { enabled: false, label: "", path: "" },
  initialDoc = [],
  onDocChange = () => {},
  disabled,
}: {
  initialAction?: ActionFields;
  initialDoc?: unknown[];
  onDocChange?: (doc: unknown[]) => void;
  disabled?: boolean;
}) {
  const [action, setAction] = useState(initialAction);
  return (
    <MessageCard
      title=""
      onTitleChange={() => {}}
      initialDoc={initialDoc}
      onDocChange={onDocChange}
      textLength={1204}
      contentError={null}
      action={action}
      onActionChange={setAction}
      disabled={disabled}
    />
  );
}

function image(url: string) {
  return { type: "image", props: { url }, children: [] };
}

const FOREIGN_ONE = "Esta imagen no está subida a Glitter: subila de nuevo.";

describe("MessageCard", () => {
  afterEach(() => {
    cleanup();
    editor.emit = null;
    editor.uploadFile = undefined;
    uploads.startUpload.mockReset();
  });

  it("counts the text in the server's measure, es-BO grouped", () => {
    render(<Harness />);
    expect(screen.getByText("1.204/5.000")).toBeTruthy();
  });

  it("refuses a page with spaces and asks for a Glitter path", () => {
    render(
      <Harness
        initialAction={{
          enabled: true,
          label: "Ver",
          path: "/my participations",
        }}
      />,
    );
    const path = screen.getByLabelText("Página de Glitter");
    expect(
      screen.getByText("La dirección no puede tener espacios."),
    ).toBeTruthy();
    expect(path.getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(path, { target: { value: "https://otro.sitio/x" } });
    expect(
      screen.getByText(
        "Pegá un enlace de Glitter que empiece con /, por ejemplo /my_participations.",
      ),
    ).toBeTruthy();

    fireEvent.change(path, { target: { value: "//evil.example" } });
    expect(path.getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(path, { target: { value: "/my_participations" } });
    expect(path.getAttribute("aria-invalid")).toBe("false");
    expect(
      screen.getByText(
        "Pegá un enlace de Glitter. Para enlazar otro sitio, ponelo en el texto.",
      ),
    ).toBeTruthy();
  });

  it("clears both button fields when the switch goes off", () => {
    render(
      <Harness
        initialAction={{ enabled: true, label: "Ver mi reserva", path: "/x" }}
      />,
    );
    const toggle = screen.getByRole("switch", { name: "Agregar un botón" });
    fireEvent.click(toggle);
    expect(screen.queryByLabelText("Texto del botón")).toBeNull();
    fireEvent.click(toggle);
    expect(
      (screen.getByLabelText("Texto del botón") as HTMLInputElement).value,
    ).toBe("");
    expect(
      (screen.getByLabelText("Página de Glitter") as HTMLInputElement).value,
    ).toBe("");
  });

  it("ignores what the editor reports before the admin touches it", () => {
    const onDocChange = vi.fn();
    render(<Harness onDocChange={onDocChange} />);
    editor.emit?.([{ type: "paragraph", content: [] }]);
    expect(onDocChange).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByTestId("editor"), { key: "a" });
    editor.emit?.([{ type: "paragraph", content: "a" }]);
    expect(onDocChange).toHaveBeenCalledWith([
      { type: "paragraph", content: "a" },
    ]);
  });

  it("flags images from another site, as the send would refuse them", () => {
    render(
      <Harness
        initialDoc={[
          image("https://otro.sitio/plano.png"),
          image("https://abc.ufs.sh/f/KEY"),
        ]}
      />,
    );
    const group = screen.getByRole("group", { name: "Texto" });
    expect(screen.getByText(FOREIGN_ONE)).toBeTruthy();
    expect(group.getAttribute("aria-describedby")).toContain(
      "comunicado-text-images",
    );

    // What the editor shows, before the admin types too: a paste lands.
    act(() =>
      editor.emit?.([
        image("https://otro.sitio/plano.png"),
        {
          type: "paragraph",
          content: [],
          children: [image("http://utfs.io/f/K")],
        },
      ]),
    );
    expect(
      screen.getByText(
        "2 imágenes no están subidas a Glitter: subilas de nuevo.",
      ),
    ).toBeTruthy();

    act(() => editor.emit?.([image("https://abc.ufs.sh/f/KEY")]));
    expect(screen.queryByText(/subida.? a Glitter/)).toBeNull();
    expect(group.getAttribute("aria-describedby")).toBe(
      "comunicado-text-counter",
    );
  });

  it("says nothing for images uploaded to Glitter, or one still uploading", () => {
    render(
      <Harness initialDoc={[image("https://abc.ufs.sh/f/KEY"), image("")]} />,
    );
    expect(screen.queryByText(/subida.? a Glitter/)).toBeNull();
  });

  it("hands the editor the comunicado image upload", async () => {
    uploads.startUpload.mockResolvedValue([
      { serverData: { imageUrl: "https://abc.ufs.sh/f/PLANO" } },
    ]);
    render(<Harness />);
    const png = new File(["png"], "plano.png", { type: "image/png" });

    expect(uploads.endpoint).toBe("comunicadoImage");
    await expect(editor.uploadFile?.(png)).resolves.toBe(
      "https://abc.ufs.sh/f/PLANO",
    );
    expect(uploads.startUpload).toHaveBeenCalledWith([png]);
  });

  it("offers no upload while the card is disabled", () => {
    render(<Harness disabled />);
    expect(editor.uploadFile).toBeUndefined();
  });
});
