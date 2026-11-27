import { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { liveActs } from "@/db/schema";

/**
 * Cultural activities (the public name of what the database still calls
 * "live acts"): shared types, paths and the public copy. Client-safe and free
 * of markup, so the landing, the wizard and the admin speak the same
 * vocabulary.
 */

export type LiveAct = InferSelectModel<typeof liveActs>;
export type NewLiveAct = InferInsertModel<typeof liveActs>;

/** Client-supplied fields allowed when creating a postulation (server sets status, notes, timestamps). */
export type CreateLiveActInput = Pick<
  NewLiveAct,
  | "actName"
  | "category"
  | "description"
  | "resourceLink"
  | "socialLinks"
  | "contactName"
  | "contactEmail"
  | "contactPhone"
  | "otherType"
  | "workshopCapacity"
  | "spaceNeeds"
  | "relatedOffer"
>;
export type LiveActStatus = LiveAct["status"];
export type LiveActCategory = LiveAct["category"];

export const CULTURAL_ACTIVITIES_PATH = "/actividades-culturales";
export const CULTURAL_ACTIVITY_APPLY_PATH = "/actividades-culturales/postular";

/** Display order everywhere: landing, wizard, admin filters. */
export const CULTURAL_ACTIVITY_CATEGORIES = [
  "music",
  "dance",
  "talk",
  "workshop",
  "other",
] as const satisfies readonly LiveActCategory[];

/** `?tipo=` on the apply page, in Spanish. */
export const CULTURAL_ACTIVITY_TIPO_SLUGS = {
  music: "musica",
  dance: "baile",
  talk: "charla",
  workshop: "taller",
  other: "otro",
} as const satisfies Record<LiveActCategory, string>;

export function categoryFromTipo(
  tipo: string | string[] | undefined | null,
): LiveActCategory | null {
  const value = Array.isArray(tipo) ? tipo[0] : tipo;
  if (!value) return null;
  const match = (
    Object.entries(CULTURAL_ACTIVITY_TIPO_SLUGS) as [LiveActCategory, string][]
  ).find(([, slug]) => slug === value.trim().toLowerCase());
  return match ? match[0] : null;
}

export function culturalActivityApplyHref(category: LiveActCategory): string {
  return `${CULTURAL_ACTIVITY_APPLY_PATH}?tipo=${CULTURAL_ACTIVITY_TIPO_SLUGS[category]}`;
}

/** Same answer for a new postulation and a bot. */
export type SubmitCulturalActivityResult =
  | { success: true }
  | { success: false; message: string };

export const CULTURAL_ACTIVITY_DESCRIPTION_MAX_LENGTH = 1000;
export const CULTURAL_ACTIVITY_DESCRIPTION_MIN_LENGTH = 20;
export const CULTURAL_ACTIVITY_MAX_SOCIAL_LINKS = 5;
export const CULTURAL_ACTIVITY_MAX_WORKSHOP_CAPACITY = 500;
export const CULTURAL_ACTIVITY_SPACE_NEEDS_MAX_LENGTH = 500;
export const CULTURAL_ACTIVITY_RELATED_OFFER_MAX_LENGTH = 300;
export const CULTURAL_ACTIVITY_OTHER_TYPE_MAX_LENGTH = 80;

/** The wizard's steps, in order. */
export const CULTURAL_ACTIVITY_STEPS = [
  {
    section: "tipo",
    navLabel: "Tipo de actividad",
    title: "¿Qué vas a hacer?",
    lead: "Elegí el tipo de actividad. Las preguntas del siguiente paso se adaptan a lo que elijas.",
  },
  {
    section: "actividad",
    navLabel: "Tu actividad",
    title: "Tu actividad",
    /** Per category: see `CULTURAL_ACTIVITY_CATEGORY_CONFIG[...].lead`. */
    lead: "",
  },
  {
    section: "contacto",
    navLabel: "Contacto",
    title: "Contacto",
    lead: "¿A quién le escribimos si tu actividad es seleccionada?",
  },
] as const;

export type CulturalActivityStep =
  (typeof CULTURAL_ACTIVITY_STEPS)[number]["section"];

/** Public copy, in voseo. */
export const CULTURAL_ACTIVITY_COPY = {
  title: "Actividades culturales",
  metaDescription:
    "Música, baile, charlas, talleres y otras propuestas culturales para los festivales de Glitter. Contanos qué hacés y postulá.",
  heroTitleLead: "Actividades",
  heroTitleAccent: "culturales",
  heroSubhead: "Traé tu actividad a los festivales de Glitter.",
  heroLead:
    "Buscamos música, baile, charlas, talleres y otras propuestas culturales para los festivales de Glitter. Contanos qué hacés y te escribimos si encaja en la programación.",
  applyCta: "Postular mi actividad",
  seeCategories: "Ver qué buscamos",
  howTitle: "Cómo funciona",
  howSteps: [
    {
      title: "Elegí el tipo de actividad",
      text: "Música, baile, charla, taller u otra actividad.",
    },
    {
      title: "Contanos tu propuesta",
      text: "Una descripción y un enlace a un video o documento para evaluarla.",
    },
    {
      title: "Esperá nuestro mensaje",
      text: "Si tu actividad es seleccionada, te escribimos al correo o al celular que nos dejes.",
    },
  ],
  categoriesTitle: "Qué buscamos",
  categoriesLead:
    "Cinco formas de ser parte del festival. Cada una te pide algo distinto para que podamos evaluarla.",
  youWillNeed: "Vas a necesitar",
  bandTitle: "¿Tenés algo para compartir?",
  bandText: "Postulá tu actividad en 3 pasos.",
  notGuaranteed: "Postular no garantiza un lugar en la programación.",
  faqTitle: "Preguntas frecuentes",
  faqContactLead: "¿No encontrás tu respuesta? Escribinos por Instagram a",
  faqContactMiddle: "o por correo a",
  contactEmail: "info@productoraglitter.com",
  instagramHandle: "@glitter.bo",
  ogSubtitle: "Traé tu actividad a los festivales de Glitter",

  applyTitle: "Postulá tu actividad",
  exitForm: "Salir del formulario",
  backToLanding: "Volver a la página de actividades culturales",
  navFootnote: "Solo escribimos a las actividades seleccionadas.",
  continue: "Continuar",
  submit: "Enviar postulación",
  submitting: "Enviando...",
  back: "Atrás",
  changeType: "Cambiar tipo",
  otherTypeLabel: "¿Qué tipo de actividad es?",
  otherTypePlaceholder: "Ej: feria de fanzines, exposición, juego en vivo",
  otherTypeHint: "Con pocas palabras alcanza.",
  socialLinksLegend: "Redes sociales o sitio web (opcional)",
  addLink: "Agregar enlace",
  workshopPlaceNote:
    "Los talleres pueden realizarse en un aula o en un espacio abierto dentro del festival, según lo que necesite la actividad.",
  workshopCostNote:
    "Los talleres no deben tener costo para quienes participan, pero sí pueden ser la introducción a un curso o programa más grande.",
  noCostLabel:
    "Entiendo que el taller no debe tener costo para quienes participan.",
  contactNameLabel: "Nombre del encargado",
  contactEmailLabel: "Correo",
  contactPhoneLabel: "Celular / WhatsApp",
  contactPhoneHint:
    "Revisá bien el número: también te podemos escribir por WhatsApp.",

  receivedTitle: "Recibimos tu postulación",
  receivedReview:
    "La revisamos con el enlace que nos compartiste. Postular no garantiza un lugar en la programación.",
  backHome: "Volver al inicio",
  applyAnother: "Postular otra actividad",

  errors: {
    category: "Seleccioná un tipo de actividad",
    otherType: "Contanos qué tipo de actividad es",
    actNameShort: "El nombre debe tener al menos 3 caracteres",
    tooLong: "Es demasiado largo",
    descriptionShort: "La descripción debe tener al menos 20 caracteres",
    link: "Ingresá un enlace válido",
    tooManyLinks: "No se permiten más de 5 enlaces",
    capacity: "Ingresá cuántas personas pueden participar",
    noCost:
      "Tenés que aceptar que el taller no tenga costo para quienes participan",
    email: "Ingresá un correo válido, por ejemplo nombre@gmail.com.",
  },
  reviewFields: "Revisá los campos marcados antes de enviar.",
  tooManyRequests:
    "Hiciste muchos intentos seguidos. Esperá un rato y volvé a intentar.",
  genericError: "Error al enviar la postulación",
} as const;

export const CULTURAL_ACTIVITY_FAQ = [
  {
    question: "¿Qué enlace sirve?",
    answer:
      "Cualquier enlace público: Google Drive, Instagram, YouTube o similar. Si es de Drive, compartilo como «Cualquier persona con el enlace» para que podamos abrirlo.",
  },
  {
    question: "¿Dónde se hacen las charlas y los talleres?",
    answer:
      "Las charlas se hacen en un aula. Los talleres pueden realizarse en un aula o en un espacio abierto dentro del festival, según lo que necesite la actividad. En el formulario podés contarnos qué necesitás: mesas, enchufes, proyector o materiales.",
  },
  {
    question: "¿Puedo cobrar por un taller?",
    answer:
      "No. Los talleres no deben tener costo para quienes participan, pero sí pueden ser la introducción a un curso o programa más grande: contanos cuál en el formulario y presentalo durante el taller.",
  },
  {
    question: "Mi actividad no entra en ninguna categoría",
    answer:
      "Elegí «Otra actividad» y contanos de qué se trata. Revisamos todas las propuestas.",
  },
  {
    question: "¿Cómo me entero si quedé?",
    answer:
      "Te escribimos al correo o al celular que dejes en el formulario. Solo contactamos a las actividades seleccionadas.",
  },
] as const;

type OptionalField = { label: string; placeholder: string; hint?: string };

export type CulturalActivityCategoryConfig = {
  /** "Música". */
  title: string;
  /** Landing card. */
  explanation: string;
  needs: string;
  linkLabel: string;
  /** Wizard step 1: one short line. */
  short: string;
  /** Wizard step 2. */
  lead: string;
  actNameLabel: string;
  actNamePlaceholder: string;
  descriptionLabel: string;
  descriptionHint: string;
  descriptionPlaceholder?: string;
  descriptionRequired: boolean;
  resourceLinkLabel: string;
  resourceLinkHint: string;
  /** Talks, workshops and other activities. */
  spaceNeeds?: OptionalField;
  /** Workshops. */
  capacity?: { label: string; hint: string };
  relatedOffer?: OptionalField;
};

const VIDEO_LINK_HINT =
  "Un video con el que podamos evaluar tu presentación: Google Drive, Instagram, YouTube o similar. Revisá que se abra sin pedir permiso.";

export const CULTURAL_ACTIVITY_CATEGORY_CONFIG: Record<
  LiveActCategory,
  CulturalActivityCategoryConfig
> = {
  music: {
    title: "Música",
    explanation:
      "Tocá en vivo para el público del festival. Buscamos propuestas acústicas de grupos, dúos o solistas.",
    needs: "Un video de tu presentación.",
    linkLabel: "Postular música",
    short: "Grupos, dúos o solistas en formato acústico.",
    lead: "Contanos quiénes son y compartí un video para que podamos evaluarte.",
    actNameLabel: "Nombre artístico",
    actNamePlaceholder: "Ej: Glitter Duo",
    descriptionLabel: "Descripción de la presentación",
    descriptionHint: "Tu estilo, experiencia previa o dónde tocaron antes.",
    descriptionPlaceholder:
      "Contanos tu estilo musical, tu experiencia previa, etc.",
    descriptionRequired: false,
    resourceLinkLabel: "Enlace al video",
    resourceLinkHint: VIDEO_LINK_HINT,
  },
  dance: {
    title: "Baile",
    explanation:
      "Presentá una coreografía en vivo durante el festival, en grupo o como solista.",
    needs: "Un video y una descripción del género y tu experiencia.",
    linkLabel: "Postular baile",
    short: "Grupos de baile o presentaciones solistas.",
    lead: "Contanos sobre el grupo y compartí un video para que podamos evaluarte.",
    actNameLabel: "Nombre del grupo o solista",
    actNamePlaceholder: "Ej: La Danza de Theo",
    descriptionLabel: "Descripción de la presentación",
    descriptionHint: "El género, cuántas personas son y su experiencia.",
    descriptionRequired: true,
    resourceLinkLabel: "Enlace al video",
    resourceLinkHint: VIDEO_LINK_HINT,
  },
  talk: {
    title: "Charla",
    explanation:
      "Compartí con la comunidad un tema que conozcas: tu oficio, tu proceso creativo o una experiencia que valga la pena contar.",
    needs: "Un documento con el contenido o la estructura de tu charla.",
    linkLabel: "Postular charla",
    short: "Presentaciones y charlas para la comunidad.",
    lead: "Contanos de qué vas a hablar y compartí el contenido de tu charla.",
    actNameLabel: "Expositor y tema de la charla",
    actNamePlaceholder: "Ej: Juan Pérez · La ciencia de la ilustración",
    descriptionLabel: "Descripción de la charla",
    descriptionHint:
      "De qué vas a hablar, a quién está dirigida y cuánto dura.",
    descriptionRequired: true,
    resourceLinkLabel: "Enlace al documento",
    resourceLinkHint:
      "El contenido o la estructura de tu charla. Revisá que se abra sin pedir permiso.",
    spaceNeeds: {
      label: "¿Qué necesitás para la charla?",
      placeholder: "Proyector, micrófono, sillas…",
    },
  },
  workshop: {
    title: "Taller",
    explanation:
      "Guiá a un grupo en una actividad práctica, paso a paso, para que aprenda haciendo. La actividad no debe tener costo para quienes participan, pero sí puede ser la introducción a un curso o programa más grande.",
    needs:
      "Un documento con el plan del taller y cuántas personas pueden participar.",
    linkLabel: "Postular taller",
    short: "Talleres prácticos, sin costo para quienes participan.",
    lead: "Contanos qué van a aprender y compartí el plan del taller.",
    actNameLabel: "Tallerista y nombre del taller",
    actNamePlaceholder: "Ej: Ana Rojas · Encuadernación japonesa",
    descriptionLabel: "Descripción del taller",
    descriptionHint:
      "Qué van a aprender, cómo es una sesión y a quién está dirigido.",
    descriptionRequired: true,
    resourceLinkLabel: "Enlace al plan del taller",
    resourceLinkHint:
      "Un documento con el paso a paso, la duración y los materiales. Revisá que se abra sin pedir permiso.",
    capacity: {
      label: "Cupo de participantes",
      hint: "Cuántas personas pueden participar a la vez.",
    },
    spaceNeeds: {
      label: "¿Qué necesitás para el taller?",
      placeholder:
        "Mesas, enchufes, proyector, materiales que tenemos que conseguir…",
    },
    relatedOffer: {
      label: "Curso o programa relacionado",
      placeholder:
        "Ej: un curso completo, un club de lectura, clases particulares",
      hint: "Si el taller es la introducción a algo más grande, contanos qué es. Podés presentarlo durante el taller.",
    },
  },
  other: {
    title: "Otra actividad",
    explanation:
      "Si tu actividad no entra en ninguna de las otras opciones, contanos de qué se trata.",
    needs: "Una descripción y un enlace con fotos, video o un documento.",
    linkLabel: "Postular otra actividad",
    short: "Si tu actividad no entra en ninguna de las otras opciones.",
    lead: "Contanos de qué se trata y compartí un enlace para conocerla.",
    actNameLabel: "Nombre de la actividad",
    actNamePlaceholder: "Ej: Feria de trueque de fanzines",
    descriptionLabel: "Descripción de la actividad",
    descriptionHint: "Qué es, cómo participa el público y cuánto dura.",
    descriptionRequired: true,
    resourceLinkLabel: "Enlace con fotos, video o un documento",
    resourceLinkHint:
      "Algo que nos ayude a conocer la actividad. Revisá que se abra sin pedir permiso.",
    spaceNeeds: {
      label: "¿Qué espacio necesitás?",
      placeholder: "Un espacio abierto, mesas, enchufes…",
    },
  },
};

/** Admin and public labels for a category ("Otra actividad: Feria"). */
export function culturalActivityCategoryLabel(
  category: LiveActCategory,
  otherType?: string | null,
): string {
  const title = CULTURAL_ACTIVITY_CATEGORY_CONFIG[category].title;
  return category === "other" && otherType ? `${title}: ${otherType}` : title;
}
