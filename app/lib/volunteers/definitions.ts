/**
 * Volunteer recruitment: shared types and fixed option lists. Client-safe and
 * free of markup, so the public page, the form, the email and (later) the
 * admin all speak the same vocabulary.
 *
 * Roles and shifts are not here: they are rows per festival
 * (`volunteer_roles`, `volunteer_shifts`), read through `queries.ts`.
 */

export const VOLUNTEERS_PATH = "/voluntarios";

/** Bumped whenever the privacy note beside the data consent changes. */
export const VOLUNTEER_PRIVACY_NOTICE_VERSION = "2026-11-v2";

export const VOLUNTEER_MIN_AGE = 18;
/** Enough for one real sentence; whitespace at the ends does not count. */
export const VOLUNTEER_MOTIVATION_MIN_LENGTH = 30;
export const VOLUNTEER_MOTIVATION_MAX_LENGTH = 500;
/** Shifts are assigned per day, never more than this many. */
export const VOLUNTEER_MAX_SHIFTS_PER_DAY = 2;

export const VOLUNTEER_EXPERIENCE_OPTIONS = [
  { value: "events", label: "Eventos" },
  { value: "customer_service", label: "Atención al público" },
  { value: "photography", label: "Fotografía" },
  { value: "social_media", label: "Redes sociales" },
  // Key kept from the first wording; stored in volunteer_applications.experience.
  { value: "own_camera", label: "Tengo cámara propia o un iPhone" },
] as const;

export type VolunteerExperience =
  (typeof VOLUNTEER_EXPERIENCE_OPTIONS)[number]["value"];

export const VOLUNTEER_EXPERIENCE_VALUES = VOLUNTEER_EXPERIENCE_OPTIONS.map(
  (option) => option.value,
) as [VolunteerExperience, ...VolunteerExperience[]];

/** Mirrors the `volunteer_referral_source` enum. */
export const VOLUNTEER_REFERRAL_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "friends", label: "Amigos" },
  { value: "university", label: "Universidad" },
  { value: "other", label: "Otro" },
] as const;

export type VolunteerReferralSource =
  (typeof VOLUNTEER_REFERRAL_OPTIONS)[number]["value"];

export const VOLUNTEER_REFERRAL_VALUES = VOLUNTEER_REFERRAL_OPTIONS.map(
  (option) => option.value,
) as [VolunteerReferralSource, ...VolunteerReferralSource[]];

export type VolunteerApplicationStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "waitlist";

/** A role as the public page and the form show it. */
export type VolunteerRole = {
  id: number;
  name: string;
  description: string;
};

/** A shift as the public page and the form show it. */
export type VolunteerShift = {
  id: number;
  label: string;
  startsAt: Date;
  endsAt: Date;
};

/**
 * The induction: a La Paz calendar date, with a start time only once one is
 * decided, so the page can say "sábado 5 de diciembre" without an hour.
 */
export type VolunteerInduction = {
  /** yyyy-MM-dd */
  date: string;
  /** "HH:mm" or "HH:mm:ss"; null while only the day is known. */
  time: string | null;
};

/** Everything the public page needs about the current call. */
export type VolunteerCall = {
  festival: {
    id: number;
    name: string;
    locationLabel: string | null;
    address: string | null;
    /** The festival's own days (not the setup day), from `festival_dates`. */
    days: Date[];
  };
  applicationsCloseAt: Date;
  /** Null until the induction is scheduled ("fecha por confirmar"). */
  induction: VolunteerInduction | null;
  roles: VolunteerRole[];
  shifts: VolunteerShift[];
  /** La Paz date (yyyy-MM-dd) the applicant must be 18 on; null without shifts. */
  ageCutoffDate: string | null;
};

/**
 * What the server action answers. Success is deliberately the same for a new
 * application, a duplicate email and a filled honeypot: the page must never
 * reveal that an address has already applied.
 */
export type SubmitVolunteerApplicationResult =
  | { success: true }
  | { success: false; message: string; closed?: boolean };

/**
 * The public copy, in voseo as the Glitter design system prescribes. Strings
 * that carry a date or a name are built in the components from these parts.
 */
export const VOLUNTEER_COPY = {
  heroTitleLead: "Sé voluntario/a en",
  heroTitleAccent: "Glitter",
  heroLead:
    "Sumate al equipo que arma el festival de ilustración y creatividad más grande de Bolivia. Elegí tus turnos, contanos en qué te gustaría ayudar y te contactaremos por WhatsApp.",
  applyNow: "Postular ahora",
  seeShifts: "Ver turnos",
  rolesTitle: "En qué podés ayudar",
  rolesLead:
    "En el formulario elegís dos roles, en orden de preferencia. Nosotros armamos el equipo según lo que haga falta en cada turno.",
  shiftsTitle: "Turnos",
  shiftsLead:
    "Cada turno dura 4 horas. Anotate en todos los que puedas cubrir: te asignamos como máximo dos por día.",
  setupDayTitle: "El viernes es día de montaje",
  setupDayText:
    "Armamos mesas y decoración. El festival abre al público el sábado.",
  maxShiftsTitle: "Máximo dos turnos por día",
  maxShiftsText:
    "Aunque marques más disponibilidad, no te asignamos más de dos turnos el mismo día.",
  benefitsTitle: "Qué recibís",
  requirementsTitle: "Requisitos",
  requirementShifts: "Cumplir completos los turnos a los que te anotes.",
  requirementInduction: "Asistir a la inducción previa.",
  inductionLabel: "Inducción:",
  inductionToBeConfirmed: "fecha por confirmar",
  faqTitle: "Preguntas frecuentes",
  applyTitle: "Postulá como voluntario/a",
  applyFootnote:
    "Son 4 pasos cortos. Postular no asegura un lugar en el equipo: te contactaremos por WhatsApp.",
  notGuaranteed: "Postular no asegura un lugar en el equipo.",
  thankYouTitle: "Recibimos tu postulación",
  thankYouMessage: "Te contactaremos por WhatsApp.",
  thankYouEmail: "Te enviamos un correo con los turnos y roles que elegiste.",
  backHome: "Volver al inicio",
  closedTitle: "Convocatoria cerrada",
  closedFollowUp:
    "Si ya postulaste, te contactaremos por WhatsApp. Para enterarte de la próxima convocatoria, seguinos en Instagram.",
  closedFollow: "Seguir a @glitter.bo",
  noCallTitle: "No hay convocatoria abierta",
  noCallMessage:
    "Por ahora no estamos buscando voluntarios. Seguinos en Instagram para enterarte de la próxima convocatoria.",
  /** Error on either required consent (commitment, data processing). */
  requiredCommitments: "Tenés que aceptar los dos compromisos para postular.",
  commitmentsTitle: "Compromisos",
  dataConsentLabel:
    "Acepto que Glitter use mis datos para coordinar el voluntariado.",
  imageConsentTitle: "Fotos y videos (opcional)",
  imageConsentLabel:
    "Autorizo el uso de mi imagen en fotos y videos del festival.",
  imageConsentNote: "Podés postular igual si no lo marcás.",
  portfolioLabel: "Portafolio, CV o enlace a tu trabajo",
  portfolioHint:
    "Opcional. Pegá el enlace completo: LinkedIn, un archivo en Drive, Instagram, Behance o tu sitio. Si es un archivo, revisá que cualquiera con el enlace pueda verlo.",
  portfolioPlaceholder: "https://",
  /** A bare "@usuario" or anything else that is not an http(s) link. */
  portfolioInvalid: "Pegá el enlace completo, empezando con https://",
  reviewFields: "Revisá los campos marcados antes de enviar.",
  tooManyRequests:
    "Recibimos demasiados intentos desde tu red. Esperá unos minutos y volvé a intentar.",
  genericError: "No pudimos enviar tu postulación. Volvé a intentar.",
} as const;

/** The volunteer FAQ: three questions, the contact one filled in at render. */
export const VOLUNTEER_FAQ = [
  {
    question: "¿El voluntariado es pago?",
    answer:
      "No. Es un voluntariado, no un trabajo remunerado. Lo que recibís está en la lista de arriba.",
  },
  {
    question: "¿Cómo eligen al equipo?",
    answer:
      "Cuando cierra la convocatoria revisamos todas las postulaciones y armamos el equipo según los turnos y los roles que hacen falta. Te contactaremos por WhatsApp con la respuesta.",
  },
] as const;

/** What a volunteer gets. Promise nothing beyond this list. */
export const VOLUNTEER_BENEFITS = [
  "Credencial y lanyard del equipo Glitter",
  "Kit de pines y stickers",
  "Certificado de participación con tus horas de voluntariado",
  "Refrigerio en cada turno",
  "Ser parte del equipo que hace posible Glitter",
] as const;

/**
 * The four steps of /voluntarios/postular, one per schema section (see
 * VOLUNTEER_FORM_SECTIONS). `title` heads the step; `navLabel` names it in
 * the step list.
 */
export const VOLUNTEER_STEPS = [
  {
    section: "personal",
    title: "Tus datos",
    navLabel: "Tus datos",
    lead: "Te contactaremos por WhatsApp, así que revisá bien tu número.",
  },
  {
    section: "shiftsAndRoles",
    title: "Turnos y roles",
    navLabel: "Turnos y roles",
    lead: "Contanos cuándo podés y en qué te gustaría ayudar.",
  },
  {
    section: "aboutYou",
    title: "Sobre vos",
    navLabel: "Sobre vos",
    lead: "No hace falta experiencia. Esto nos ayuda a ubicarte mejor.",
  },
  {
    section: "emergencyAndCommitments",
    title: "Último paso",
    navLabel: "Emergencia y compromisos",
    lead: "Un contacto de emergencia, tus compromisos y listo.",
  },
] as const;

export const VOLUNTEER_APPLY_PATH = `${VOLUNTEERS_PATH}/postular`;

/**
 * The note beside the data consent; `{festival}` and `{email}` are filled
 * in at render. Bump VOLUNTEER_PRIVACY_NOTICE_VERSION when it changes.
 */
export const VOLUNTEER_PRIVACY_NOTICE =
  "Usamos tus datos solo para coordinar el voluntariado de {festival}. No los compartimos con terceros. Para pedir que los borremos, escribinos a {email}.";
