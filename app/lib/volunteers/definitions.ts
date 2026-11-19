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
export const VOLUNTEER_PRIVACY_NOTICE_VERSION = "2026-11-v1";

export const VOLUNTEER_MIN_AGE = 18;
export const VOLUNTEER_MOTIVATION_MAX_LENGTH = 300;
/** Shifts are assigned per day, never more than this many. */
export const VOLUNTEER_MAX_SHIFTS_PER_DAY = 2;

export const VOLUNTEER_EXPERIENCE_OPTIONS = [
  { value: "events", label: "Eventos" },
  { value: "customer_service", label: "Atención al público" },
  { value: "photography", label: "Fotografía" },
  { value: "social_media", label: "Redes sociales" },
  { value: "own_camera", label: "Tengo cámara propia" },
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

export const VOLUNTEER_COPY = {
  heroTitle: "Sé voluntario/a en Glitter",
  heroLead:
    "Sumate al equipo que arma el festival de ilustración y creatividad más grande de Bolivia.",
  thankYouTitle: "¡Gracias por postularte!",
  thankYouMessage: "Recibimos tu postulación, te contactaremos por WhatsApp.",
  closedTitle: "Convocatoria cerrada",
  closedMessage:
    "Ya no estamos recibiendo postulaciones de voluntariado para este festival. ¡Gracias por tu interés!",
  noCallTitle: "No hay convocatoria abierta",
  noCallMessage:
    "Por ahora no estamos buscando voluntarios. Síguenos en redes para enterarte de la próxima convocatoria.",
  inductionToBeConfirmed: "fecha por confirmar",
  /** Error on either required consent (commitment, data processing). */
  requiredCommitments: "Para postular, marca los dos compromisos.",
  imageConsentTitle: "Fotos y videos (opcional)",
  imageConsentLabel:
    "Autorizo el uso de mi imagen en las fotos y videos del festival.",
  imageConsentNote: "Podés postular igual si no lo marcás.",
  portfolioLabel: "Portafolio o enlace a tu trabajo",
  portfolioHint:
    "Opcional. Pegá el enlace completo (Instagram, TikTok, Behance o tu sitio). Solo si elegís Fotografía y redes sociales y querés mostrarnos tus fotos o videos. No influye en los demás roles.",
  portfolioPlaceholder: "https://instagram.com/tuusuario",
  /** A bare "@usuario" or anything else that is not an http(s) link. */
  portfolioInvalid:
    "Escribe el enlace completo, empezando con https:// (por ejemplo, https://instagram.com/tuusuario).",
  tooManyRequests:
    "Recibimos demasiados intentos desde tu red. Espera unos minutos e intenta de nuevo.",
  genericError: "No pudimos enviar tu postulación. Intenta de nuevo.",
} as const;

/**
 * The note shown beside the data consent. Draft for review; bump
 * VOLUNTEER_PRIVACY_NOTICE_VERSION when it changes.
 */
export const VOLUNTEER_PRIVACY_NOTICE =
  "Con este formulario recopilamos tu nombre, fecha de nacimiento, celular, email, zona, disponibilidad, preferencias, experiencia, redes o portafolio y tu contacto de emergencia. Los usamos solo para coordinar el voluntariado de Glitter: revisar tu postulación, asignarte turnos y comunicarnos contigo. No los compartimos con terceros ni los usamos para publicidad. Si quieres que borremos tus datos, escríbenos a {email} y lo haremos.";
