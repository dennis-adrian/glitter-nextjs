import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";

import AssignShiftList from "@/app/components/volunteers/admin/tasks/assign-shift-list";
import VolunteerAvailabilityForm from "@/app/components/volunteers/admin/tasks/availability-form";
import VolunteerPeopleList from "@/app/components/volunteers/admin/tasks/people-list";
import VolunteerPersonScreen from "@/app/components/volunteers/admin/tasks/person-screen";
import VolunteerReviewScreen from "@/app/components/volunteers/admin/tasks/review-screen";
import VolunteerShiftAssignScreen from "@/app/components/volunteers/admin/tasks/shift-assign-screen";
import { VolunteerHeaderTop } from "@/app/components/volunteers/admin/tasks/task-header";
import {
  AssignStrip,
  NoCallState,
  ReviewStrip,
} from "@/app/components/volunteers/admin/tasks/task-layouts";
import { AssignByShiftPane } from "@/app/components/volunteers/admin/tasks/assign-pane";
import { ReviewPane } from "@/app/components/volunteers/admin/tasks/review-frame";
import {
  VolunteerSoloScreen,
  VolunteerTaskFrame,
} from "@/app/components/volunteers/admin/tasks/volunteer-task-frame";
import { AssignModeNav } from "@/app/components/volunteers/admin/tasks/assign-shift-list";
import type {
  VolunteerApplicationDetail,
  VolunteerShiftDetail,
} from "@/app/lib/volunteers/admin-definitions";
import type {
  VolunteerNote,
  VolunteerPersonItem,
  VolunteerReviewItem,
  VolunteerTaskCall,
  VolunteerTaskShift,
} from "@/app/lib/volunteers/admin-task-queries";

import { remainingPlaces } from "@/app/lib/volunteers/admin-tasks";
import { VolunteerAdminStoryContext } from "./volunteer-admin-story-context";

/**
 * The volunteer admin by task (canvas page "Admin v2 — por tarea") with
 * v11's roles and shifts and the mockups' numbers, at phone and desktop
 * widths, without the app or a database. Writes answer from the mocked
 * actions.
 */

const at = (iso: string) => new Date(iso);
const TODAY = at("2026-11-21T16:00:00Z");
const FESTIVAL_ID = 11;
const BASE = `/dashboard/festivals/${FESTIVAL_ID}/volunteers`;

const ROLE_NAMES = [
  "Acreditación y check-in de los visitantes y participantes",
  "Orientación al público",
  "Apoyo a expositores",
  "Montaje y desmontaje",
  "Fotografía y redes sociales",
  "Actividades y talleres",
];
const ROLES: VolunteerTaskCall["roles"] = ROLE_NAMES.map((name, index) => ({
  id: index + 1,
  name,
  description: "",
  sortOrder: index + 1,
  isActive: true,
  choiceCount: 4,
  acceptedCount: [2, 2, 1, 2, 5, 0][index]!,
}));

type ShiftRow = [
  label: string,
  start: string,
  end: string,
  needed: number,
  assigned: number,
  acceptedUnassigned: number,
  pending: number,
  roles: number[],
];
const SHIFT_ROWS: ShiftRow[] = [
  [
    "Montaje",
    "2026-12-18T19:00:00Z",
    "2026-12-18T23:00:00Z",
    8,
    4,
    6,
    3,
    [1, 2, 3, 4, 5, 6],
  ],
  [
    "Terminar montaje",
    "2026-12-19T14:00:00Z",
    "2026-12-19T18:00:00Z",
    6,
    6,
    2,
    1,
    [4],
  ],
  [
    "Festival (turno A)",
    "2026-12-19T17:30:00Z",
    "2026-12-19T21:30:00Z",
    10,
    7,
    5,
    4,
    [1, 2, 3, 4, 5, 6],
  ],
  [
    "Festival + cierre (turno B)",
    "2026-12-19T21:30:00Z",
    "2026-12-20T01:30:00Z",
    10,
    6,
    6,
    4,
    [1, 2, 3, 4, 5, 6],
  ],
  [
    "Festival (turno A)",
    "2026-12-20T17:30:00Z",
    "2026-12-20T21:30:00Z",
    10,
    5,
    9,
    6,
    [1, 2, 4, 5, 6],
  ],
  [
    "Festival + desmontaje de mesas (turno B)",
    "2026-12-20T21:30:00Z",
    "2026-12-21T01:30:00Z",
    10,
    2,
    4,
    5,
    [3, 4, 5, 6],
  ],
];
const SHIFTS: VolunteerTaskShift[] = SHIFT_ROWS.map(
  (
    [label, start, end, needed, assigned, acceptedUnassigned, pending, roles],
    index,
  ) => ({
    id: index + 1,
    label,
    startsAt: at(start),
    endsAt: at(end),
    neededHeadcount: needed,
    sortOrder: index + 1,
    isActive: true,
    availableCount: assigned + acceptedUnassigned + pending,
    assignedCount: assigned,
    unassignedAvailableCount: acceptedUnassigned + pending,
    acceptedUnassignedCount: acceptedUnassigned,
    pendingAvailableCount: pending,
    assignedRoleIds: roles,
  }),
);

const CALL: VolunteerTaskCall = {
  festival: { id: FESTIVAL_ID, name: "Glitter v11" },
  settings: {
    applicationsCloseAt: at("2026-12-01T03:59:00Z"),
    inductionDate: "2026-12-12",
    inductionTime: "10:00:00",
  },
  roles: ROLES,
  shifts: SHIFTS,
  statusTotals: {
    all: 48,
    pending: 31,
    accepted: 12,
    waitlist: 2,
    rejected: 3,
  },
  acceptedWithoutShifts: 3,
};

const MOTIVATION =
  "Sigo Glitter desde la primera edición y siempre quise estar del otro lado. Estudio comunicación, saco fotos en eventos de la universidad y me encantaría aprender cómo se arma un festival así de grande. Además tengo cámara propia y puedo editar en el momento para las redes.";

const REVIEW_ITEMS: VolunteerReviewItem[] = [
  ["María Fernanda Quispe Mamani de la Cruz Villarroel", "2004-05-02", 5, 3],
  ["Camila Rojas", "2007-01-10", 2, 5],
  ["Diego Alejandro Fernández", "1999-03-14", 4, 2],
  ["Sofía Mendoza Arce", "2002-08-30", 6, 6],
  ["Andrés Choque", "1995-11-02", 3, 1],
].map(([fullName, birthdate, role, available], index) => ({
  id: 100 + index,
  fullName: fullName as string,
  birthdate: birthdate as string,
  motivation: MOTIVATION,
  firstChoiceRoleName: ROLE_NAMES[(role as number) - 1]!,
  availableCount: available as number,
}));
const ORDER = Array.from({ length: 31 }, (_, index) => 89 + index);

function detail(
  overrides: Partial<VolunteerApplicationDetail>,
): VolunteerApplicationDetail {
  return {
    id: 100,
    festivalId: FESTIVAL_ID,
    fullName: "María Fernanda Quispe Mamani de la Cruz Villarroel",
    birthdate: "2004-05-02",
    phone: "+591 70000001",
    email: "maria.fernanda.quispe.mamani.delacruz@universidad-ejemplo.edu.bo",
    zone: "Sopocachi",
    firstChoiceRoleId: 5,
    secondChoiceRoleId: 2,
    experience: ["photography", "own_camera"],
    experienceNotes:
      "Cubrí la feria del libro de la universidad dos años seguidos, armé el Instagram del centro de estudiantes y ayudé en la logística de un concierto benéfico con más de 800 personas.",
    portfolio: "https://portafolio.ejemplo.com/maria-fernanda",
    motivation: MOTIVATION,
    emergencyContactName: "Rosa Mamani",
    emergencyContactPhone: "+591 70000009",
    referralSource: "instagram",
    consentedAt: at("2026-11-21T14:00:00Z"),
    privacyNoticeVersion: "2026-11",
    imageConsent: true,
    status: "pending",
    assignedRoleId: null,
    adminNotes: null,
    availableShiftIds: [1, 3, 4],
    assignedShiftIds: [],
    reviewedBy: null,
    reviewedAt: null,
    createdAt: at("2026-11-21T14:00:00Z"),
    updatedAt: at("2026-11-21T14:00:00Z"),
    ...overrides,
  };
}

const PENDING = detail({ id: 100 });
const ACCEPTED = detail({
  id: 201,
  fullName: "Valentina Gutiérrez",
  birthdate: "2007-02-01",
  email: "valentina@example.com",
  status: "accepted",
  assignedRoleId: 5,
  availableShiftIds: [3, 5],
  assignedShiftIds: [3, 5],
  experience: ["photography", "social_media"],
  experienceNotes: null,
  portfolio: null,
  reviewedBy: { id: 1, displayName: "Dennis" },
  reviewedAt: at("2026-11-22T15:00:00Z"),
  createdAt: at("2026-11-20T14:00:00Z"),
});
const WITHOUT_SHIFTS = detail({
  id: 202,
  fullName: "Hernán Vargas",
  birthdate: "2002-03-01",
  email: "hernan@example.com",
  status: "accepted",
  firstChoiceRoleId: 2,
  secondChoiceRoleId: 3,
  availableShiftIds: [2, 4, 5, 6],
  assignedShiftIds: [],
  experience: ["events", "customer_service"],
  experienceNotes: null,
  portfolio: null,
});
const NOTES: VolunteerNote[] = [
  {
    id: 1,
    body: "Muy buena predisposición. Prefiere turnos de tarde.",
    authorName: "Dennis",
    createdAt: at("2026-11-22T15:00:00Z"),
  },
];

const SHIFT_DETAIL: VolunteerShiftDetail = {
  festival: { id: FESTIVAL_ID, name: "Glitter v11" },
  shift: { ...SHIFTS[4]! },
  assignees: [
    ["Valentina Gutiérrez", 5],
    ["Paola Céspedes", 2],
    ["Rodrigo Alanoca Choquehuanca", 2],
    ["Ana Belén Torrez", 1],
    ["Daniela Villca", 1],
  ].map(([fullName, roleId], index) => ({
    applicationId: 300 + index,
    fullName: fullName as string,
    status: "accepted" as const,
    assignedRoleId: roleId as number,
    assignedRoleName: ROLE_NAMES[(roleId as number) - 1]!,
  })),
  candidates: (
    [
      ["Hernán Vargas", 2, 3, null, 0],
      ["Esteban Quiroga", 3, 6, null, 0],
      ["Fabiola Mamani", 2, 1, 2, 1],
      ["Gonzalo Ríos Saavedra del Castillo", 4, 1, 4, 2],
    ] as const
  ).map(([fullName, first, second, assigned, held], index) => ({
    applicationId: 400 + index,
    fullName,
    status: "accepted" as const,
    firstChoiceRoleId: first,
    secondChoiceRoleId: second,
    firstChoiceRoleName: ROLE_NAMES[first - 1]!,
    secondChoiceRoleName: ROLE_NAMES[second - 1]!,
    assignedRoleId: assigned,
    assignedRoleName: assigned ? ROLE_NAMES[assigned - 1]! : null,
    shiftsThatDay: held,
  })),
};

const PEOPLE: VolunteerPersonItem[] = [
  ["Hernán Vargas", 2, null, [2, 4, 5, 6], []],
  ["Esteban Quiroga", 3, null, [5, 6], []],
  ["Carla Gutiérrez", 4, null, [1, 2, 3], []],
  ["Fabiola Mamani", 2, 2, [1, 3, 4, 5, 6], [3]],
  ["Valentina Gutiérrez", 5, 5, [3, 5], [3, 5]],
  [
    "Gonzalo Ríos Saavedra del Castillo",
    4,
    4,
    [1, 2, 3, 4, 5, 6],
    [1, 2, 3, 4],
  ],
].map(([fullName, first, assigned, available, held], index) => ({
  id: 500 + index,
  fullName: fullName as string,
  firstChoiceRoleName: ROLE_NAMES[(first as number) - 1]!,
  assignedRoleName: assigned ? ROLE_NAMES[(assigned as number) - 1]! : null,
  availableShiftIds: available as number[],
  assignedShiftIds: held as number[],
}));

const meta = {
  title: "Volunteers/Admin por tarea",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: false } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const reviewScreen = (application: VolunteerApplicationDetail) => (
  <VolunteerReviewScreen
    festivalId={FESTIVAL_ID}
    application={application}
    roles={ROLES}
    shifts={SHIFTS}
    notes={[]}
    order={ORDER}
    sort="antiguas"
    today={TODAY}
  />
);

/**
 * The header and frame Revisar and Asignar share around `children`, as their
 * layout renders it; the task follows the story's path.
 */
const tasksFrame = (children: ReactNode) => (
  <VolunteerTaskFrame
    festivalId={FESTIVAL_ID}
    top={<VolunteerHeaderTop call={CALL} now={TODAY} />}
    pending={CALL.statusTotals.pending}
    places={remainingPlaces(CALL.shifts).places}
    strips={{
      revisar: <ReviewStrip call={CALL} />,
      asignar: <AssignStrip call={CALL} />,
    }}
  >
    {children}
  </VolunteerTaskFrame>
);

/** V2Revisar / V2Escritorio */
/** Revisar's layouts around `children`, as the route groups render them. */
const reviewFrame = (children: ReactNode) =>
  tasksFrame(
    <ReviewPane
      festivalId={FESTIVAL_ID}
      noCall={<NoCallState festivalId={FESTIVAL_ID} />}
      batches={{
        antiguas: REVIEW_ITEMS,
        nuevas: [...REVIEW_ITEMS].reverse(),
        turnos: REVIEW_ITEMS,
      }}
      total={CALL.statusTotals.pending}
      shiftTotal={CALL.shifts.filter((shift) => shift.isActive).length}
    >
      {children}
    </ReviewPane>,
  );

export const Revisar: Story = {
  render: () => (
    <VolunteerAdminStoryContext path={BASE}>
      {reviewFrame(reviewScreen(detail({ id: 100 })))}
    </VolunteerAdminStoryContext>
  ),
};

/** V2Postulacion */
export const Postulacion: Story = {
  render: () => (
    <VolunteerAdminStoryContext
      path={`${BASE}/100`}
      params={{ applicationId: "100" }}
    >
      {reviewFrame(reviewScreen(PENDING))}
    </VolunteerAdminStoryContext>
  ),
};

const personScreen = (
  application: VolunteerApplicationDetail,
  assigning: boolean,
  flip: string,
) => (
  <VolunteerPersonScreen
    festivalId={FESTIVAL_ID}
    application={application}
    roles={ROLES}
    shifts={SHIFTS}
    notes={NOTES}
    flip={{ label: flip, previousHref: `${BASE}/1`, nextHref: `${BASE}/2` }}
    backHref={`${BASE}/asignar`}
    backLabel={assigning ? "Por persona" : "Asignar"}
    assigning={assigning}
    summaryHref={`${BASE}/${application.id}`}
    assignHref={`${BASE}/${application.id}?asignar=1`}
    decisionHref={`${BASE}/${application.id}?revisar=1`}
    today={TODAY}
  />
);

/** V2Aceptada */
export const Aceptada: Story = {
  render: () => (
    <VolunteerAdminStoryContext path={`${BASE}/201`}>
      {tasksFrame(
        <VolunteerSoloScreen>
          {personScreen(ACCEPTED, false, "2 de 12")}
        </VolunteerSoloScreen>,
      )}
    </VolunteerAdminStoryContext>
  ),
};

/** V2SinAsignar */
export const SinAsignar: Story = {
  render: () => (
    <VolunteerAdminStoryContext path={`${BASE}/202`}>
      {tasksFrame(
        <VolunteerSoloScreen>
          {personScreen(WITHOUT_SHIFTS, true, "1 de 3 sin turnos")}
        </VolunteerSoloScreen>,
      )}
    </VolunteerAdminStoryContext>
  ),
};

const shiftScreen = (
  <VolunteerShiftAssignScreen
    festivalId={FESTIVAL_ID}
    detail={SHIFT_DETAIL}
    roles={ROLES}
    backHref={`${BASE}/asignar`}
    reviewHref={BASE}
  />
);

/** V2Asignar / V2AsignarEscritorio */
export const Asignar: Story = {
  render: () => (
    <VolunteerAdminStoryContext path={`${BASE}/asignar`}>
      {tasksFrame(
        <AssignByShiftPane
          festivalId={FESTIVAL_ID}
          shifts={CALL.shifts}
          roles={CALL.roles}
          withoutShifts={CALL.acceptedWithoutShifts}
          firstId={5}
        >
          {shiftScreen}
        </AssignByShiftPane>,
      )}
    </VolunteerAdminStoryContext>
  ),
};

/** V2Agregar */
export const Agregar: Story = {
  render: () => (
    <VolunteerAdminStoryContext
      path={`${BASE}/shifts/5`}
      params={{ shiftId: "5" }}
    >
      {tasksFrame(
        <AssignByShiftPane
          festivalId={FESTIVAL_ID}
          shifts={CALL.shifts}
          roles={CALL.roles}
          withoutShifts={CALL.acceptedWithoutShifts}
        >
          {shiftScreen}
        </AssignByShiftPane>,
      )}
    </VolunteerAdminStoryContext>
  ),
};

/** V2AsignarPersonas */
export const PorPersona: Story = {
  render: () => (
    <VolunteerAdminStoryContext path={`${BASE}/asignar/personas`}>
      {tasksFrame(
        <div className="flex w-full max-w-2xl min-w-0 flex-col gap-3.5">
          <AssignModeNav
            festivalId={FESTIVAL_ID}
            mode="persona"
            withoutShifts={3}
          />
          <VolunteerPeopleList
            festivalId={FESTIVAL_ID}
            items={PEOPLE}
            total={12}
            shifts={SHIFTS}
          />
        </div>,
      )}
    </VolunteerAdminStoryContext>
  ),
};

/** V2Disponibilidad */
export const Disponibilidad: Story = {
  render: () => (
    <VolunteerAdminStoryContext path={`${BASE}/201/disponibilidad`}>
      {tasksFrame(
        <VolunteerSoloScreen>
          <VolunteerAvailabilityForm
            festivalId={FESTIVAL_ID}
            application={ACCEPTED}
            shifts={SHIFTS}
            adminAddedShiftIds={[]}
            backHref={`${BASE}/201`}
          />
        </VolunteerSoloScreen>,
      )}
    </VolunteerAdminStoryContext>
  ),
};

/** The shift list on its own, for the empty and full states. */
export const ListaDeTurnos: Story = {
  render: () => (
    <VolunteerAdminStoryContext path={`${BASE}/asignar`}>
      <div className="p-3">
        <AssignShiftList
          festivalId={FESTIVAL_ID}
          shifts={SHIFTS}
          roles={ROLES}
        />
      </div>
    </VolunteerAdminStoryContext>
  ),
};
