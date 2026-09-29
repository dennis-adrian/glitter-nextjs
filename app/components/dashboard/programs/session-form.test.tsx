import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createSession, updateSession, push, refresh } = vi.hoisted(() => ({
  createSession: vi.fn(),
  updateSession: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

// The actions pull in `db` and therefore `server-only`; the form only calls them.
vi.mock("@/app/lib/programs/admin-actions", () => ({
  createSession,
  updateSession,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/app/components/uploads/uploadthing-image-button", () => ({
  UploadThingImageButton: () => <div>upload</div>,
}));

import SessionForm from "@/app/components/dashboard/programs/session-form";
import type { ProgramSession } from "@/app/lib/programs/definitions";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const FESTIVALS = [{ id: 5, name: "Glitter 2026" }];

function session(overrides: Partial<ProgramSession> = {}): ProgramSession {
  const createdAt = new Date("2026-09-01T12:00:00.000Z");
  return {
    id: 11,
    programId: null,
    festivalId: null,
    slug: "cobrar-sin-morir",
    title: "Cobrar sin morir",
    type: "talk",
    topic: null,
    description: null,
    learningOutcomes: [],
    skillLevel: null,
    imageUrl: null,
    audience: "all",
    publicPrice: 70,
    participantPrice: null,
    status: "draft",
    publishedAt: null,
    venueId: null,
    displayOrder: 0,
    updatedAt: createdAt,
    createdAt,
    ...overrides,
  };
}

function submit(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

describe("SessionForm", () => {
  it("offers a festival and no program fallback for a standalone session", () => {
    render(
      <SessionForm
        programId={null}
        venues={[]}
        topics={[]}
        canUploadImages
        festivals={FESTIVALS}
      />,
    );

    expect(screen.getByText("Festival asociado")).toBeTruthy();
    expect(screen.queryByText("Lugar (si difiere del programa)")).toBeNull();
    expect(screen.getByText("Vacío aplica el descuento global.")).toBeTruthy();
    expect(screen.getByText("Imagen de la sesión")).toBeTruthy();
  });

  it("keeps the image button, disabled with the reason, for a viewer who cannot upload", () => {
    render(
      <SessionForm
        programId={null}
        venues={[]}
        topics={[]}
        canUploadImages={false}
      />,
    );

    expect(screen.queryByText("upload")).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Seleccionar imagen",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getByText(
        "Solo el equipo de administración puede subir imágenes.",
      ),
    ).toBeTruthy();
  });

  it("asks for no festival inside a program", () => {
    render(
      <SessionForm programId={3} venues={[]} topics={[]} canUploadImages />,
    );

    expect(screen.queryByText("Festival asociado")).toBeNull();
    expect(screen.getByText("Lugar (si difiere del programa)")).toBeTruthy();
  });

  it("creates a standalone session and opens its standalone admin page", async () => {
    createSession.mockResolvedValue({
      success: true,
      message: "Sesión creada",
      sessionId: 77,
    });

    render(
      <SessionForm
        programId={null}
        venues={[]}
        topics={[]}
        canUploadImages
        festivals={FESTIVALS}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Título/), {
      target: { value: "Cómo cobrar" },
    });
    submit("Crear sesión");

    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        programId: null,
        festivalId: null,
        title: "Cómo cobrar",
      }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/dashboard/programs/sessions/77"),
    );
  });

  it("creates a program session under its program", async () => {
    createSession.mockResolvedValue({
      success: true,
      message: "Sesión creada",
      sessionId: 78,
    });

    render(
      <SessionForm programId={3} venues={[]} topics={[]} canUploadImages />,
    );

    fireEvent.change(screen.getByLabelText(/Título/), {
      target: { value: "Taller de tintas" },
    });
    submit("Crear sesión");

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/dashboard/programs/3/sessions/78"),
    );
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ programId: 3, festivalId: null }),
    );
  });

  // `updateSession` writes whatever festival it is sent on a standalone
  // session, so a form that dropped it would clear the festival on every save.
  it("keeps a standalone session's festival when saving other changes", async () => {
    updateSession.mockResolvedValue({
      success: true,
      message: "Sesión actualizada",
    });

    render(
      <SessionForm
        programId={null}
        session={session({ festivalId: 5 })}
        venues={[]}
        topics={[]}
        festivals={FESTIVALS}
      />,
    );

    submit("Guardar cambios");

    await waitFor(() => expect(updateSession).toHaveBeenCalledTimes(1));
    expect(updateSession).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ programId: null, festivalId: 5 }),
    );
    expect(push).not.toHaveBeenCalled();
  });
});
