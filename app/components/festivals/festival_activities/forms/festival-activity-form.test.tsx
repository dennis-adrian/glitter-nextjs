import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FestivalActivityForm from "./festival-activity-form";
import type { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/app/lib/festival_activites/admin-actions", () => ({
  createFestivalActivity: mocks.create,
  updateFestivalActivity: mocks.update,
}));
vi.mock("@/app/components/festivals/sectors/sector-image-upload", () => ({
  default: () => <span>Selector de imagen</span>,
}));

const start = new Date("2026-09-22T18:47:00Z");
const end = new Date("2026-09-25T22:00:00Z");
const activity: FestivalActivityWithDetailsAndParticipants = {
  id: 16,
  festivalId: 490,
  name: "Cuponera existente",
  type: "coupon_book",
  description: "Promos del festival",
  visitorsDescription: "Descuentos para visitantes",
  accessLevel: "public",
  promotionalArtUrl: "/promo.png",
  activityPrizeUrl: null,
  registrationStartDate: start,
  registrationEndDate: end,
  proofType: "text",
  proofUploadLimitDate: end,
  allowsVoting: false,
  votingStartDate: null,
  votingEndDate: null,
  waitlistWindowMinutes: 60,
  createdAt: start,
  updatedAt: start,
  details: [
    {
      id: 84,
      activityId: 16,
      description: "Gastronomía",
      category: "gastronomy",
      participationLimit: 20,
      imageUrl: null,
      couponBookHeaderImageUrl: "/header.png",
      createdAt: start,
      updatedAt: start,
      participants: [],
      votes: [],
    },
  ],
  waitlistEntries: [],
};

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ success: true, message: "Creada" });
  mocks.update.mockResolvedValue({ success: true, message: "Guardada" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function completeBasicFields() {
  fireEvent.change(screen.getByLabelText(/Nombre de la actividad/), {
    target: { value: "Nueva cuponera" },
  });
  fireEvent.change(screen.getByLabelText(/^Apertura de inscripciones\s/), {
    target: { value: "2026-09-22" },
  });
  fireEvent.change(screen.getByLabelText(/^Cierre de inscripciones\s/), {
    target: { value: "2026-09-25" },
  });
}

describe("festival activity form", () => {
  it.each([
    { hour: "2", period: "PM", utc: "2026-09-22T18:00:00Z" },
    { hour: "12", period: "AM", utc: "2026-09-22T04:00:00Z" },
    { hour: "12", period: "PM", utc: "2026-09-22T16:00:00Z" },
  ])(
    "creates an activity at $hour $period in Bolivia",
    async ({ hour, period, utc }) => {
      render(<FestivalActivityForm festivalId={490} />);
      completeBasicFields();
      fireEvent.change(
        screen.getByLabelText("Apertura de inscripciones: hora"),
        {
          target: { value: hour },
        },
      );
      fireEvent.change(
        screen.getByLabelText("Apertura de inscripciones: AM o PM"),
        { target: { value: period } },
      );
      fireEvent.click(screen.getByRole("button", { name: "Crear actividad" }));
      await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
      expect(mocks.create.mock.calls[0][1]).toMatchObject({
        name: "Nueva cuponera",
        registrationStartDate: new Date(utc),
        details: [{ participationLimit: undefined }],
      });
      expect(mocks.push).toHaveBeenCalledWith(
        "/dashboard/festivals/490/festival_activities",
      );
    },
  );
  it("edits without shifting existing dates or losing variant IDs and images", async () => {
    render(<FestivalActivityForm festivalId={490} activity={activity} />);
    expect(
      (
        screen.getByLabelText(
          "Apertura de inscripciones: hora",
        ) as HTMLSelectElement
      ).value,
    ).toBe("2");
    expect(
      (
        screen.getByLabelText(
          "Apertura de inscripciones: AM o PM",
        ) as HTMLSelectElement
      ).value,
    ).toBe("PM");
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
    expect(mocks.update.mock.calls[0]).toEqual([
      16,
      490,
      expect.objectContaining({
        registrationStartDate: start,
        registrationEndDate: end,
        promotionalArtUrl: "/promo.png",
        details: [
          expect.objectContaining({
            id: 84,
            participationLimit: 20,
            category: "gastronomy",
            couponBookHeaderImageUrl: "/header.png",
          }),
        ],
      }),
    ]);
  });
  it("shows the material deadline error before calling the server", async () => {
    render(<FestivalActivityForm festivalId={490} />);
    completeBasicFields();
    fireEvent.change(screen.getByLabelText("Tipo de material"), {
      target: { value: "text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear actividad" }));
    await screen.findByText("Indicá hasta cuándo se puede enviar el material");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("keeps values and offers retry after a network failure", async () => {
    mocks.update.mockRejectedValue(new Error("network"));
    render(<FestivalActivityForm festivalId={490} activity={activity} />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText(/No se pudo guardar la actividad/);
    expect(
      (screen.getByLabelText(/Nombre de la actividad/) as HTMLInputElement)
        .value,
    ).toBe(activity.name);
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
