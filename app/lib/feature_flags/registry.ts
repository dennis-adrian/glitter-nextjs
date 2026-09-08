import type { FeatureFlagVisibility } from "@/app/lib/feature_flags/definitions";

export type FeatureFlagDefinition = {
  /** Shown in the admin dashboard. */
  label: string;
  /** What ships when this is public. Write it for whoever flips the switch. */
  description: string;
  /** Visibility used when the row is created on first read. */
  defaultVisibility: FeatureFlagVisibility;
};

/**
 * The catalogue of features that can be hidden until launch.
 *
 * Code owns this list; the database only stores each flag's current visibility.
 * Adding a flag is a one-line change here — the row is created on first read, so
 * no data migration is needed. Removing a flag is safe too: an orphaned row is
 * simply never read again.
 *
 * Keys are stable identifiers and must not be renamed once deployed; a rename
 * reads as a brand new flag and silently reverts to `defaultVisibility`.
 */
export const FEATURE_FLAGS = {
  paid_programs: {
    label: "Programas y sesiones pagas",
    description:
      "Catálogo público de programas (Glitter Week): charlas, talleres, compra de entradas, Week Pass y check-in.",
    defaultVisibility: "hidden",
  },
  programs_nav_entry: {
    label: "Semana Glitter en el menú",
    description:
      "Muestra el acceso a Semana Glitter en el menú principal. Independiente de `paid_programs`, para poder abrir las inscripciones por enlace directo antes de anunciarlas en el sitio. El acceso solo aparece si ambas están visibles.",
    defaultVisibility: "hidden",
  },
  blog: {
    label: "Blog",
    description:
      "Blog público: la lista, los artículos, y las páginas de categoría y etiqueta, más los accesos en el menú y el pie de página. Los artículos restringidos a participantes siguen requiriendo perfil verificado aunque esta bandera esté pública. Escribir artículos desde el panel de administración no depende de esta bandera.",
    defaultVisibility: "hidden",
  },
  blog_contributors: {
    label: "Artículos escritos por participantes",
    description:
      "Permite que participantes con reservas aceptadas en 3 o más festivales escriban artículos desde el portal y los envíen a revisión. Independiente de `blog`: el blog puede estar público y escribirse solo desde administración. Los administradores no dependen de esta bandera.",
    defaultVisibility: "hidden",
  },
  credits: {
    label: "Créditos",
    description:
      "Billetera de créditos para participantes: `/my_credits`, la página explicativa y la compra de créditos para funciones opcionales como la mesa completa. La cola de revisión del panel de administración no depende de esta bandera.",
    defaultVisibility: "hidden",
  },
} as const satisfies Record<string, FeatureFlagDefinition>;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlagKey[];

export function isKnownFeatureFlagKey(key: string): key is FeatureFlagKey {
  return Object.prototype.hasOwnProperty.call(FEATURE_FLAGS, key);
}

export function getFeatureFlagDefinition(
  key: FeatureFlagKey,
): FeatureFlagDefinition {
  return FEATURE_FLAGS[key];
}
