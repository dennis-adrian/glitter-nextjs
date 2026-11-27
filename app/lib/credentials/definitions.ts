/**
 * The festival credentials feature ("Credenciales"): types, defaults, labels
 * and copy shared by the server, the client and the tests. Nothing here may
 * import the database, `server-only` or React (docs/PLAN-credenciales.md §6).
 */

/* ------------------------------------------------------------------ */
/* Groups and rules                                                    */
/* ------------------------------------------------------------------ */

export const CREDENTIAL_GROUPS = [
  "illustration",
  "entrepreneurship",
  "gastronomy",
  "external",
  "volunteer",
  "staff",
] as const;
export type CredentialGroup = (typeof CREDENTIAL_GROUPS)[number];

/** The groups ruled by stand category, whose naming mode can be chosen. */
export const CATEGORY_CREDENTIAL_GROUPS = [
  "illustration",
  "entrepreneurship",
  "gastronomy",
] as const;
export type CategoryCredentialGroup =
  (typeof CATEGORY_CREDENTIAL_GROUPS)[number];

/** The groups the Resumen switches can leave out. */
export const TOGGLEABLE_CREDENTIAL_GROUPS = [
  "external",
  "volunteer",
  "staff",
] as const;
export type ToggleableCredentialGroup =
  (typeof TOGGLEABLE_CREDENTIAL_GROUPS)[number];

export function isCategoryGroup(
  group: CredentialGroup,
): group is CategoryCredentialGroup {
  return (CATEGORY_CREDENTIAL_GROUPS as readonly string[]).includes(group);
}

export const CREDENTIAL_NAMING_MODES = [
  "one_per_participant",
  "all_named",
  "none",
] as const;
export type CredentialNamingMode = (typeof CREDENTIAL_NAMING_MODES)[number];

export type CredentialRule = {
  /** Per stand for the category groups and externals; per person otherwise. */
  quantity: number;
  /** Only chosen for the category groups; every other group is all named. */
  namingMode: CredentialNamingMode;
};

export type CredentialRules = Record<CredentialGroup, CredentialRule>;

/**
 * The old `credentials-classifier` behaviour, per stand. May only change
 * together with a migration that writes these values as explicit rule rows
 * for every festival that already has print batches (PLAN §5), or finished
 * festivals would be re-ruled retroactively.
 */
export const DEFAULT_CREDENTIAL_RULES: CredentialRules = {
  illustration: { quantity: 2, namingMode: "one_per_participant" },
  entrepreneurship: { quantity: 2, namingMode: "one_per_participant" },
  gastronomy: { quantity: 2, namingMode: "all_named" },
  external: { quantity: 2, namingMode: "all_named" },
  volunteer: { quantity: 1, namingMode: "all_named" },
  staff: { quantity: 1, namingMode: "all_named" },
};

/** Database check bounds (`festival_credential_rules_quantity_range`). */
export const CREDENTIAL_RULE_QUANTITY_MAX = 20;
/** Database check bounds (`festival_external_credential_overrides_quantity_range`). */
export const EXTERNAL_CREDENTIAL_QUANTITY_MAX = 50;
export const STAFF_NAME_MAX = 120;
export const STAFF_ROLE_MAX = 80;
export const EXTRA_LABEL_MAX = 80;
export const EXTRA_NAME_MAX = 120;
export const EXTRA_QUANTITY_MAX = 200;
export const PRINT_BATCH_NOTE_MAX = 200;
/** Bounds the name a batch request echoes back; well above any real one. */
export const PRINT_BATCH_NAME_MAX = 1000;
export const PRINT_BATCH_MAX_HOLDERS = 2000;
export const POSTGRES_INT_MAX = 2_147_483_647;

export const CREDENTIAL_GROUP_LABELS: Record<CredentialGroup, string> = {
  illustration: "Ilustración",
  entrepreneurship: "Emprendimiento",
  gastronomy: "Gastronomía",
  external: "Participantes externos",
  volunteer: "Voluntarios",
  staff: "Equipo Glitter",
};

/** `Badge` variants; the category ones match the enum values. */
export const CREDENTIAL_GROUP_BADGE: Record<
  CredentialGroup,
  "illustration" | "entrepreneurship" | "gastronomy" | "outline" | "dark"
> = {
  illustration: "illustration",
  entrepreneurship: "entrepreneurship",
  gastronomy: "gastronomy",
  external: "outline",
  volunteer: "outline",
  staff: "dark",
};

export const CREDENTIAL_NAMING_MODE_LABELS: Record<
  CredentialNamingMode,
  string
> = {
  one_per_participant: "Una por participante, el resto sin nombre",
  all_named: "Todas, con el nombre del participante",
  none: "Ninguna",
};

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * A group's rule as the one sentence admins read in the breakdown and on the
 * Reglas tab: "2 por espacio: 1 con nombre por participante y el resto sin
 * nombre".
 */
export function credentialRuleCopy(
  group: CredentialGroup,
  rule: CredentialRule,
): string {
  const q = rule.quantity;
  if (group === "external") {
    return q === 0
      ? "Sin credenciales, salvo que fijes una cantidad por participante"
      : `${q} por espacio, con el nombre de la organización. Se puede ajustar por participante`;
  }
  if (group === "volunteer") {
    return q === 0
      ? "Sin credenciales"
      : `${q} con nombre y rol por postulación aceptada`;
  }
  if (group === "staff") {
    return q === 0
      ? "Sin credenciales"
      : `${q} con nombre y rol por persona del equipo`;
  }
  if (q === 0) return "Sin credenciales";
  switch (rule.namingMode) {
    case "one_per_participant":
      return `${q} por espacio: 1 con nombre por participante y el resto sin nombre`;
    case "all_named":
      return q === 1
        ? "1 por espacio, con el nombre del expositor"
        : `${q} por espacio, todas con el nombre del expositor`;
    case "none":
      return `${q} por espacio, todas sin nombre`;
  }
}

/**
 * The credential lines participants read on a stand card ("Servicios
 * incluidos"). With the default rules these are exactly the strings the card
 * hardcoded before rules existed, so nothing changes until a festival has
 * rules of its own.
 */
export function credentialParticipantLines(
  group: CategoryCredentialGroup,
  rule: CredentialRule,
): string[] {
  const q = rule.quantity;
  if (q === 0) return [];
  if (rule.namingMode === "all_named") {
    return [
      `${plural(q, "credencial", "credenciales")} con el nombre del expositor`,
    ];
  }
  if (rule.namingMode === "none") {
    return [`${plural(q, "credencial", "credenciales")} sin nombre`];
  }
  // One named per participant, the rest unnamed.
  if (group === "illustration") {
    if (q === 1) return ["1 credencial por espacio"];
    const companions = q - 1;
    return [
      "1 credencial por participante",
      companions === 1
        ? "1 credencial para acompañante en caso de no compartir espacio con otro ilustrador"
        : `${companions} credenciales para acompañantes (${q - 2} si compartís espacio con otro ilustrador)`,
    ];
  }
  if (q === 1) return ["1 credencial para expositor"];
  return [
    "1 credencial para expositor",
    q === 2
      ? "1 credencial para acompañante"
      : `${q - 1} credenciales para acompañantes`,
  ];
}

/* ------------------------------------------------------------------ */
/* Reservation statuses                                                */
/* ------------------------------------------------------------------ */

/** Statuses read from the database; every other status never counts. */
export const COUNTABLE_RESERVATION_STATUSES = [
  "accepted",
  "verification_payment",
  "pending",
] as const;
export type CountableReservationStatus =
  (typeof COUNTABLE_RESERVATION_STATUSES)[number];

export const CREDENTIAL_RESERVATION_STATUS_LABELS: Record<
  CountableReservationStatus | "gone",
  string
> = {
  accepted: "Confirmada",
  verification_payment: "Verificación de pago",
  pending: "Pendiente",
  gone: "Ya no cuenta",
};

export const CREDENTIAL_RESERVATION_STATUS_BADGE: Record<
  CountableReservationStatus | "gone",
  "green" | "amber" | "outline" | "red"
> = {
  accepted: "green",
  verification_payment: "amber",
  pending: "outline",
  gone: "red",
};

/* ------------------------------------------------------------------ */
/* Filters (URL state)                                                 */
/* ------------------------------------------------------------------ */

export type CredentialFilters = {
  /** Accepted reservations always count; these two are optional. */
  statuses: { verification_payment: boolean; pending: boolean };
  groups: Record<ToggleableCredentialGroup, boolean>;
};

export const DEFAULT_CREDENTIAL_FILTERS: CredentialFilters = {
  statuses: { verification_payment: false, pending: false },
  groups: { external: true, volunteer: true, staff: true },
};

const STATUS_PARAM: Record<"verification_payment" | "pending", string> = {
  verification_payment: "verificacion",
  pending: "pendientes",
};
const GROUP_PARAM: Record<ToggleableCredentialGroup, string> = {
  external: "externos",
  volunteer: "voluntarios",
  staff: "equipo",
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function paramList(value: string | string[] | undefined): Set<string> {
  const raw = firstParam(value);
  if (raw == null) return new Set();
  return new Set(
    raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

/**
 * `?estados=verificacion,pendientes` adds the optional statuses;
 * `?grupos=externos,voluntarios,equipo` lists the groups that are on (absent:
 * all on; `?grupos=` empty: all off). Unknown values are ignored.
 */
export function parseCredentialFilters(
  params: Record<string, string | string[] | undefined>,
): CredentialFilters {
  const statuses = paramList(params.estados);
  const groupsRaw = firstParam(params.grupos);
  const groups = paramList(params.grupos);
  return {
    statuses: {
      verification_payment: statuses.has(STATUS_PARAM.verification_payment),
      pending: statuses.has(STATUS_PARAM.pending),
    },
    groups: {
      external: groupsRaw == null || groups.has(GROUP_PARAM.external),
      volunteer: groupsRaw == null || groups.has(GROUP_PARAM.volunteer),
      staff: groupsRaw == null || groups.has(GROUP_PARAM.staff),
    },
  };
}

/** The search params that encode `filters`, defaults left out. */
export function credentialFilterParams(
  filters: CredentialFilters,
): Record<string, string> {
  const params: Record<string, string> = {};
  const statuses = (["verification_payment", "pending"] as const)
    .filter((status) => filters.statuses[status])
    .map((status) => STATUS_PARAM[status]);
  if (statuses.length > 0) params.estados = statuses.join(",");
  const allGroupsOn = TOGGLEABLE_CREDENTIAL_GROUPS.every(
    (group) => filters.groups[group],
  );
  if (!allGroupsOn) {
    params.grupos = TOGGLEABLE_CREDENTIAL_GROUPS.filter(
      (group) => filters.groups[group],
    )
      .map((group) => GROUP_PARAM[group])
      .join(",");
  }
  return params;
}

export function includesStatus(
  filters: CredentialFilters,
  status: CountableReservationStatus,
): boolean {
  return status === "accepted" || filters.statuses[status];
}

export function includesGroup(
  filters: CredentialFilters,
  group: CredentialGroup,
): boolean {
  return isCategoryGroup(group) || filters.groups[group];
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

export const CREDENTIAL_TABS = ["resumen", "nombres", "equipo", "reglas"] as const;
export type CredentialTab = (typeof CREDENTIAL_TABS)[number];

export const CREDENTIAL_TAB_LABELS: Record<CredentialTab, string> = {
  resumen: "Resumen",
  nombres: "Nombres",
  equipo: "Equipo y externos",
  reglas: "Reglas",
};

/** An allow-listed `?tab=`; anything else is the default tab. */
export function parseCredentialTab(
  value: string | string[] | undefined,
): CredentialTab {
  const raw = firstParam(value);
  return (CREDENTIAL_TABS as readonly string[]).includes(raw ?? "")
    ? (raw as CredentialTab)
    : "resumen";
}

/* ------------------------------------------------------------------ */
/* Paths, results and copy                                             */
/* ------------------------------------------------------------------ */

export function credentialsPath(
  festivalId: number,
  params: Record<string, string> = {},
): string {
  const search = new URLSearchParams(params).toString();
  return `/dashboard/festivals/${festivalId}/credentials${search ? `?${search}` : ""}`;
}

export function credentialsExportPath(
  festivalId: number,
  filters: CredentialFilters,
): string {
  const search = new URLSearchParams(credentialFilterParams(filters)).toString();
  return `/dashboard/festivals/${festivalId}/credentials/export${search ? `?${search}` : ""}`;
}

export type CredentialsResult =
  | { success: true; message: string }
  | { success: false; message: string };

export const CREDENTIALS_COPY = {
  title: "Credenciales",
  subtitle:
    "Cuántas credenciales hay que producir para esta edición y con qué nombres.",
  unauthorized: "No tenés permiso para hacer esto.",
  adminOnly: "Solo un administrador puede hacer esto.",
  genericError: "No pudimos guardar los cambios. Intentá de nuevo.",
  festivalNotFound: "No encontramos ese festival. Actualizá la página.",
  saved: "Cambios guardados.",
  exportCsv: "Exportar CSV",
  markPrinted: "Marcar como enviadas a imprenta",
  noCredential: "Sin credencial",
  noRole: "Sin rol",
  emptyName: "Sin nombre en el perfil",
} as const;

/* ------------------------------------------------------------------ */
/* Print state                                                         */
/* ------------------------------------------------------------------ */

export const PRINT_STATES = [
  "new",
  "printed",
  "partial",
  "surplus",
  "stale",
] as const;
export type PrintState = (typeof PRINT_STATES)[number];

/** Most urgent first: a row's badge is its most urgent unit's. */
export const PRINT_STATE_URGENCY: readonly PrintState[] = [
  "stale",
  "partial",
  "new",
  "surplus",
  "printed",
];

/** The Nombres "Impresión" filter. */
export const PRINT_FILTERS = ["todas", "pendientes", "impresas", "baja"] as const;
export type PrintFilter = (typeof PRINT_FILTERS)[number];
export const PRINT_FILTER_LABELS: Record<PrintFilter, string> = {
  todas: "Todas",
  pendientes: "Por imprimir",
  impresas: "Ya impresas",
  baja: "Ya no corresponden",
};
