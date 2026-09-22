import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import type { BaseProfile } from "@/app/api/users/definitions";
import type { ProofDisplayState } from "@/app/lib/festival_activites/types";
import type { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import FestivalActivityCard from "./card";

// Relative dates keep each scenario valid whenever Storybook is opened.
const now = new Date();
const daysFromNow = (days: number) =>
  new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
const profile = { id: 101, category: "illustration" } as BaseProfile;

function activity(
  overrides: Partial<FestivalActivityWithDetailsAndParticipants> = {},
): FestivalActivityWithDetailsAndParticipants {
  return {
    id: 42,
    festivalId: 7,
    name: "Cuponera de Descuentos",
    description: null,
    type: "coupon_book",
    registrationStartDate: daysFromNow(-7),
    registrationEndDate: daysFromNow(7),
    proofUploadLimitDate: daysFromNow(10),
    proofType: "text",
    promotionalArtUrl: null,
    visitorsDescription: null,
    activityPrizeUrl: null,
    allowsVoting: false,
    votingStartDate: null,
    votingEndDate: null,
    accessLevel: "public",
    waitlistWindowMinutes: 60,
    createdAt: now,
    updatedAt: now,
    details: [
      {
        id: 84,
        activityId: 42,
        category: "illustration",
        description: null,
        imageUrl: null,
        couponBookHeaderImageUrl: null,
        participationLimit: 50,
        createdAt: now,
        updatedAt: now,
        participants: [],
        votes: [],
      },
    ],
    waitlistEntries: [],
    ...overrides,
  };
}

function enrolled(proofState: ProofDisplayState = "pending_proof") {
  const result = activity();
  result.details[0].participants = [
    {
      id: 12,
      detailsId: 84,
      userId: profile.id,
      user: profile,
      removedAt: proofState === "rejected_removed" ? now : null,
      removalReason:
        proofState === "rejected_removed" ? "Participación cancelada" : null,
      createdAt: now,
      updatedAt: now,
      proofs:
        proofState === "pending_proof"
          ? []
          : [
              {
                id: 15,
                participationId: 12,
                imageUrl: null,
                proofStatus: proofState,
                promoHighlight: "2×1",
                promoDescription: "En stickers seleccionados",
                promoConditions: "Hasta agotar stock",
                adminFeedback:
                  proofState === "rejected_resubmit"
                    ? "Aclarar las condiciones de la promoción"
                    : null,
                createdAt: now,
                updatedAt: now,
              },
            ],
    },
  ];
  return result;
}

function waitlisted(invited = false) {
  return activity({
    waitlistEntries: [
      {
        id: 9,
        activityId: 42,
        userId: profile.id,
        user: profile,
        position: 3,
        notifiedAt: invited ? now : null,
        expiresAt: invited ? daysFromNow(1) : null,
        notifiedForDetailId: invited ? 84 : null,
        createdAt: now,
        updatedAt: now,
      },
    ],
  });
}

const meta = {
  title: "Participant portal/Festival activity card",
  component: FestivalActivityCard,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-full max-w-[376px]">
        <Story />
      </div>
    ),
  ],
  args: { forProfile: profile, activity: activity() },
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Tarjeta real del portal. Fechas relativas a la apertura de Storybook; acciones de guardado simuladas. Probá también el viewport móvil para revisar títulos y fechas largas.",
      },
    },
  },
} satisfies Meta<typeof FestivalActivityCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Upcoming: Story = {
  name: "Inscripciones próximamente",
  args: { activity: activity({ registrationStartDate: daysFromNow(1) }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Inscripciones próximamente")).toBeVisible();
    await expect(canvas.getByText(/^Desde: .* (AM|PM)$/)).toBeVisible();
    await expect(canvas.queryByText(/^Hasta:/)).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: "Ver detalles" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("link", { name: "Participar" }),
    ).not.toBeInTheDocument();
  },
};
export const Open: Story = {
  name: "Inscripciones abiertas",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Inscripciones abiertas")).toBeVisible();
    await expect(canvas.getByText(/^Hasta: .* (AM|PM)$/)).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Participar" }),
    ).toHaveAttribute("href", "/profiles/101/festivals/7/activity/42");
  },
};
export const Closed: Story = {
  name: "Inscripciones cerradas",
  args: { activity: activity({ registrationEndDate: daysFromNow(-1) }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Inscripciones cerradas")).toBeVisible();
    await expect(canvas.getByText(/^Finalizaron:/)).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Ver detalles" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("link", { name: "Participar" }),
    ).not.toBeInTheDocument();
  },
};
export const Waitlisted: Story = {
  name: "Lista de espera",
  args: { activity: waitlisted() },
};
export const Invited: Story = {
  name: "Cupo disponible",
  args: { activity: waitlisted(true) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("¡Tenés un cupo disponible!")).toBeVisible();
    await expect(
      canvas.getByText(/^Inscribite hasta: .* (AM|PM)$/),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Inscribirme ahora" }),
    ).toHaveAttribute("href", "/profiles/101/festivals/7/activity/42");
    await expect(
      canvas.queryByRole("link", { name: "Ver detalles" }),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByText(/^Hasta:/)).not.toBeInTheDocument();
  },
};
export const InvitedAfterRegistrationClosed: Story = {
  ...Invited,
  name: "Cupo disponible tras cierre de inscripciones",
  args: {
    activity: { ...waitlisted(true), registrationEndDate: daysFromNow(-1) },
  },
};
export const PendingProof: Story = {
  name: "Promoción pendiente",
  args: { activity: enrolled() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Fecha límite de envío:")).toBeVisible();
    await expect(canvas.getByText(/ (AM|PM)$/)).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Agregar promoción" }),
    ).toBeVisible();
  },
};
export const PendingReview: Story = {
  name: "Promoción en revisión",
  args: { activity: enrolled("pending_review") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("En revisión")).toBeVisible();
    await expect(
      canvas.getByText("Estamos revisando tu promoción."),
    ).toBeVisible();
    await expect(canvas.queryByText("Inscrito")).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Agregar promoción" }),
    ).not.toBeInTheDocument();
  },
};
export const Approved: Story = {
  name: "Participación aprobada",
  args: { activity: enrolled("approved") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Aprobado")).toBeVisible();
    await expect(
      canvas.getByText("Tu promoción fue aprobada para el festival."),
    ).toBeVisible();
    await expect(canvas.queryByText("Inscrito")).not.toBeInTheDocument();
    await expect(canvas.queryByText("En revisión")).not.toBeInTheDocument();
  },
};
export const CorrectionsRequested: Story = {
  name: "Correcciones solicitadas",
  args: { activity: enrolled("rejected_resubmit") },
};
export const ProofDeadlinePassed: Story = {
  name: "Plazo de entrega vencido",
  args: { activity: { ...enrolled(), proofUploadLimitDate: daysFromNow(-1) } },
};
export const Removed: Story = {
  name: "Participación cancelada",
  args: { activity: enrolled("rejected_removed") },
};
export const Voting: Story = {
  name: "Votación abierta",
  args: {
    activity: activity({
      name: "Stand Icónico",
      type: "best_stand",
      proofType: "image",
      allowsVoting: true,
      registrationEndDate: daysFromNow(-1),
      votingStartDate: daysFromNow(-1),
      votingEndDate: daysFromNow(1),
    }),
  },
};
export const LongContent: Story = {
  name: "Título y descripción largos",
  args: {
    activity: activity({
      name: "Cuponera de Descuentos de los Emprendimientos del Festival",
      description:
        "Compartí una promoción especial con quienes visitan el festival. Sumá tus productos y contanos las condiciones para que todas las personas puedan aprovecharla.",
      registrationStartDate: daysFromNow(1),
    }),
  },
};
