import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { fn } from "storybook/test";

import VolunteerApplicationReceived from "@/app/components/volunteers/volunteer-application-received";
import VolunteerApplicationWizard from "@/app/components/volunteers/volunteer-application-wizard";
import VolunteerApplyCallout from "@/app/components/volunteers/volunteer-apply-callout";
import VolunteerBenefitsRequirements from "@/app/components/volunteers/volunteer-benefits-requirements";
import VolunteerFaqSection from "@/app/components/volunteers/volunteer-faq-section";
import VolunteerRolesGrid from "@/app/components/volunteers/volunteer-roles-grid";
import VolunteerShiftsSection from "@/app/components/volunteers/volunteer-shifts-section";
import VolunteersHero from "@/app/components/volunteers/volunteers-hero";
import type { VolunteerCall } from "@/app/lib/volunteers/definitions";
import { volunteerDraftKey } from "@/app/lib/volunteers/draft";
import { volunteerPageView } from "@/app/lib/volunteers/page-data";

/**
 * /voluntarios and /voluntarios/postular with v11's data, for checking the
 * layout at phone and desktop widths without the app or a database.
 */

const at = (iso: string) => new Date(iso);

const CALL: VolunteerCall = {
  festival: {
    id: 11,
    name: "Glitter v11",
    locationLabel: "Teatro CBA",
    address: "Santa Cruz de la Sierra",
    days: [at("2026-12-19T14:00:00Z"), at("2026-12-20T14:00:00Z")],
  },
  applicationsCloseAt: at("2026-12-01T03:59:00Z"),
  induction: { date: "2026-12-05", time: null },
  roles: [
    {
      id: 1,
      name: "Acreditación y check-in de los visitantes y participantes",
      description:
        "Recibís en el ingreso al público y a los expositores del festival, y verificás su registro.",
    },
    {
      id: 2,
      name: "Orientación al público",
      description:
        "Respondés dudas y ayudás a ubicar stands, baños y actividades.",
    },
    {
      id: 3,
      name: "Apoyo a expositores",
      description:
        "Acompañás a ilustradores y emprendedores con lo que necesiten en su stand.",
    },
    {
      id: 4,
      name: "Montaje y desmontaje",
      description:
        "Armás y desarmás mesas, señalética y decoración antes y después del festival.",
    },
    {
      id: 5,
      name: "Fotografía y redes sociales",
      description:
        "Registrás el festival en fotos y videos para las redes de Glitter.",
    },
    {
      id: 6,
      name: "Actividades y talleres",
      description:
        "Preparás materiales y ayudás a que cada actividad empiece a tiempo.",
    },
  ],
  shifts: [
    ["Montaje", "2026-12-18T19:00:00Z", "2026-12-18T23:00:00Z"],
    ["Terminar montaje", "2026-12-19T14:00:00Z", "2026-12-19T18:00:00Z"],
    ["Festival (turno A)", "2026-12-19T17:30:00Z", "2026-12-19T21:30:00Z"],
    [
      "Festival + cierre (turno B)",
      "2026-12-19T21:30:00Z",
      "2026-12-20T01:30:00Z",
    ],
    ["Festival (turno A)", "2026-12-20T17:30:00Z", "2026-12-20T21:30:00Z"],
    [
      "Festival + desmontaje de mesas (turno B)",
      "2026-12-20T21:30:00Z",
      "2026-12-21T01:30:00Z",
    ],
  ].map(([label, start, end], index) => ({
    id: index + 1,
    label: label!,
    startsAt: at(start!),
    endsAt: at(end!),
  })),
  ageCutoffDate: "2026-12-18",
};

function Landing({ open }: { open: boolean }) {
  const view = volunteerPageView(
    CALL,
    open ? at("2026-11-20T12:00:00Z") : at("2026-12-02T12:00:00Z"),
  );
  return (
    <div className="-m-6 bg-brand-elevated">
      <VolunteersHero
        festivalName={CALL.festival.name}
        dateTile={view.dateTile}
        venue={view.venue}
        setupDay={view.setupDay}
        closesLabel={view.closesShort}
        open={view.open}
      />
      <VolunteerRolesGrid roles={CALL.roles} />
      <VolunteerShiftsSection shifts={CALL.shifts} />
      <VolunteerBenefitsRequirements
        ageCutoff={view.ageCutoff}
        induction={view.induction}
      />
      <VolunteerFaqSection />
      <VolunteerApplyCallout
        open={view.open}
        festivalName={CALL.festival.name}
        closesLabel={view.closesLong}
      />
    </div>
  );
}

function Wizard({ step }: { step: number }) {
  const view = volunteerPageView(CALL, at("2026-11-20T12:00:00Z"));
  try {
    window.sessionStorage.setItem(
      volunteerDraftKey(CALL.festival.id),
      JSON.stringify({
        version: 1,
        step,
        values:
          step === 0
            ? {}
            : {
                fullName: "Camila Rojas",
                birthdate: "2000-05-10",
                phone: "+59170000001",
                email: "camila@example.test",
                shiftIds: [1, 3, 4],
                firstChoiceRoleId: "5",
                secondChoiceRoleId: "2",
                experience: ["photography", "own_camera"],
                commitmentConsent: true,
              },
      }),
    );
  } catch {
    // Storage blocked: the story starts empty.
  }
  return (
    <div className="-m-6">
      <VolunteerApplicationWizard
        key={step}
        festivalId={CALL.festival.id}
        festivalName={CALL.festival.name}
        roles={CALL.roles}
        shifts={CALL.shifts}
        ageCutoffDate={CALL.ageCutoffDate!}
        applicationsCloseAt={at("2099-01-01T00:00:00Z")}
        closesLabel={view.closesLong}
        closesOn={view.closesOn}
        induction={view.induction}
      />
    </div>
  );
}

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
  title: "Volunteers/Pages",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: false } },
  decorators: [
    (Story) => (
      <AppRouterContext.Provider value={storyRouter}>
        <Story />
      </AppRouterContext.Provider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const LandingOpen: Story = { render: () => <Landing open /> };
export const LandingClosed: Story = { render: () => <Landing open={false} /> };
export const Step1TusDatos: Story = { render: () => <Wizard step={0} /> };
export const Step2TurnosYRoles: Story = { render: () => <Wizard step={1} /> };
export const Step3SobreVos: Story = { render: () => <Wizard step={2} /> };
export const Step4UltimoPaso: Story = { render: () => <Wizard step={3} /> };
export const Gracias: Story = {
  render: () => (
    <div className="-m-6 flex min-h-dvh flex-col">
      <VolunteerApplicationReceived closesOn="30 de noviembre" />
    </div>
  ),
};
