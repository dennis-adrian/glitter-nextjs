import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import VolunteerApplicationDetailView from "@/app/components/volunteers/admin/volunteer-application-detail-view";
import type {
  VolunteerAdminCall,
  VolunteerApplicationDetail,
} from "@/app/lib/volunteers/admin-definitions";

/**
 * /dashboard/festivals/[id]/volunteers/[applicationId] with v11's roles and
 * shifts, for checking the layout at phone and desktop widths without the
 * app or a database. "Guardar cambios" answers from the mocked actions.
 */

const at = (iso: string) => new Date(iso);
/** Pinned, so the ages stay put. */
const TODAY = at("2026-11-21T16:00:00Z");

const ROLES: VolunteerAdminCall["roles"] = [
  "Acreditación y check-in de los visitantes y participantes",
  "Orientación al público",
  "Apoyo a expositores",
  "Montaje y desmontaje",
  "Fotografía y redes sociales",
  "Actividades y talleres",
].map((name, index) => ({
  id: index + 1,
  name,
  description: "",
  sortOrder: index + 1,
  isActive: true,
  choiceCount: [3, 2, 2, 3, 5, 1][index]!,
}));

const SHIFTS: VolunteerAdminCall["shifts"] = (
  [
    ["Montaje", "2026-12-18T19:00:00Z", "2026-12-18T23:00:00Z", 8, 14, 4],
    [
      "Terminar montaje",
      "2026-12-19T14:00:00Z",
      "2026-12-19T18:00:00Z",
      6,
      11,
      6,
    ],
    [
      "Festival (turno A)",
      "2026-12-19T17:30:00Z",
      "2026-12-19T21:30:00Z",
      10,
      29,
      7,
    ],
    [
      "Festival + cierre (turno B)",
      "2026-12-19T21:30:00Z",
      "2026-12-20T01:30:00Z",
      10,
      22,
      6,
    ],
    [
      "Festival (turno A)",
      "2026-12-20T17:30:00Z",
      "2026-12-20T21:30:00Z",
      10,
      26,
      5,
    ],
    [
      "Festival + desmontaje de mesas (turno B)",
      "2026-12-20T21:30:00Z",
      "2026-12-21T01:30:00Z",
      10,
      9,
      2,
    ],
  ] as const
).map(([label, start, end, needed, available, assigned], index) => ({
  id: index + 1,
  label,
  startsAt: at(start),
  endsAt: at(end),
  neededHeadcount: needed,
  sortOrder: index + 1,
  isActive: true,
  availableCount: available,
  assignedCount: assigned,
}));

const PENDING: VolunteerApplicationDetail = {
  id: 2,
  festivalId: 11,
  fullName: "María Fernanda Quispe Mamani de la Cruz Villarroel",
  birthdate: "2004-05-12",
  phone: "+591 70000001",
  email: "maria.fernanda.quispe.mamani.delacruz.villarroel@universidad.edu.bo",
  zone: "Villa Fátima",
  firstChoiceRoleId: 5,
  secondChoiceRoleId: 1,
  experience: ["photography", "own_camera", "social_media"],
  experienceNotes:
    "Cubrí dos ferias de emprendedores en la UMSA y manejo la cuenta de Instagram de mi carrera.",
  portfolio:
    "https://www.instagram.com/mafer.quispe.fotografia.y.retratos.lapaz/",
  motivation:
    "Me encanta el ambiente de Glitter y quiero aprender cómo se arma un festival desde adentro.\n\nAdemás, quiero sumar fotos a mi portafolio.",
  emergencyContactName: "Rosa Villarroel de Quispe",
  emergencyContactPhone: "+591 70000009",
  referralSource: "instagram",
  consentedAt: at("2026-11-21T14:12:00Z"),
  privacyNoticeVersion: "2026-11-v2",
  imageConsent: false,
  status: "pending",
  assignedRoleId: null,
  adminNotes: null,
  availableShiftIds: [1, 3, 4],
  assignedShiftIds: [],
  reviewedBy: null,
  reviewedAt: null,
  createdAt: at("2026-11-21T14:12:00Z"),
  updatedAt: at("2026-11-21T14:12:00Z"),
};

/**
 * Accepted, as AdminDetalle draws it: three shifts on Saturday 19 (over the
 * limit, so the save is blocked) and one of them not marked.
 */
const ACCEPTED_OVER_LIMIT: VolunteerApplicationDetail = {
  ...PENDING,
  id: 3,
  fullName: "Camila Rojas",
  email: "camila.rojas@example.com",
  zone: null,
  referralSource: "friends",
  imageConsent: true,
  portfolio: null,
  experience: ["events"],
  experienceNotes: null,
  status: "accepted",
  assignedRoleId: 5,
  assignedShiftIds: [1, 3, 4],
  adminNotes: "Trae su cámara. Prefiere la tarde del sábado.",
  reviewedBy: { id: 1, displayName: "Dennis" },
  reviewedAt: at("2026-11-20T22:15:00Z"),
};

// Storybook's app-router mock lacks the layout context Next 16.4's
// `useRouter` reads (see stories/home/home-history-card.stories.tsx).
const storyRouter = {
  back: fn(),
  forward: fn(),
  refresh: fn(),
  push: fn(),
  replace: fn(),
  prefetch: fn(),
} as unknown as React.ContextType<typeof AppRouterContext>;

const meta = {
  title: "Volunteers/Admin/Detail",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: false } },
  decorators: [
    (Story) => (
      <AppRouterContext.Provider value={storyRouter}>
        <div className="-m-6">
          <Story />
        </div>
      </AppRouterContext.Provider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Detail({ application }: { application: VolunteerApplicationDetail }) {
  return (
    <VolunteerApplicationDetailView
      festivalId={11}
      application={application}
      roles={ROLES}
      shifts={SHIFTS}
      today={TODAY}
    />
  );
}

/** Long name, email, link and role names; assignment locked. */
export const Pending: Story = {
  render: () => <Detail application={PENDING} />,
};

/**
 * Accepted with two Saturday shifts; the play adds "Terminar montaje", which
 * she did not mark: three that day, past the recommended two. The amber box
 * says so and "Guardar cambios" stays enabled (admins may make exceptions).
 */
export const AcceptedOverLimit: Story = {
  render: () => <Detail application={ACCEPTED_OVER_LIMIT} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /Ver los otros \d+ turnos/ }),
    );
    const terminar = canvasElement.querySelector<HTMLElement>(
      '[data-shift-id="2"] [role="checkbox"]',
    );
    await userEvent.click(terminar!);
    await waitFor(() =>
      expect(canvas.getByRole("status").textContent).toBe(
        "Tiene 3 turnos asignados el sábado 19 y uno de ellos no lo marcó como disponible. El máximo recomendado es 2 por día. Podés guardar igual.",
      ),
    );
    await expect(
      canvas.getByRole("button", { name: "Guardar cambios" }),
    ).toBeEnabled();
  },
};
