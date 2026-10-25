// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MessageCard, {
  type ActionFields,
} from "@/app/components/comunicados/admin/composer/message-card";

const editor = vi.hoisted(() => ({
  emit: null as null | ((doc: unknown) => void),
}));

// BlockNote does not run in jsdom: a stand-in that can report a change, as
// the real editor does on mount and on input.
vi.mock("@/app/components/organisms/rich-text-editor", () => ({
  default: (props: { onChange?: (json: unknown, html: string) => void }) => {
    editor.emit = (doc) => props.onChange?.(doc, "");
    return <div contentEditable data-testid="editor" />;
  },
}));

function Harness({
  initialAction = { enabled: false, label: "", path: "" },
  onDocChange = () => {},
}: {
  initialAction?: ActionFields;
  onDocChange?: (doc: unknown[]) => void;
}) {
  const [action, setAction] = useState(initialAction);
  return (
    <MessageCard
      title=""
      onTitleChange={() => {}}
      initialDoc={[]}
      onDocChange={onDocChange}
      textLength={1204}
      contentError={null}
      action={action}
      onActionChange={setAction}
    />
  );
}

describe("MessageCard", () => {
  afterEach(() => {
    cleanup();
    editor.emit = null;
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
});
