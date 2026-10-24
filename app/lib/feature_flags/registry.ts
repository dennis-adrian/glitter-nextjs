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
    label: "Charlas y talleres",
    description:
      "Catálogo público de programas y sesiones, gratuitas o pagas: inscripción, compra de entradas, Mis inscripciones y check-in con QR. Si se oculta, quienes ya se inscribieron dejan de ver su entrada y el equipo no puede hacer check-in.",
    defaultVisibility: "hidden",
  },
  programs_nav_entry: {
    label: "Charlas y Talleres en el menú",
    description:
      "Muestra el acceso a Charlas y Talleres en el menú principal. Independiente de `paid_programs`, para poder abrir las inscripciones por enlace directo antes de anunciarlas en el sitio. El acceso solo aparece si ambas están visibles.",
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
  notifications: {
    label: "Notificaciones en la app",
    description:
      "La campana del menú, `/my_notifications` y el detalle de cada notificación: reservas, pagos, compras de créditos rechazadas, postulaciones, infracciones y sanciones, regalos de créditos, y las notificaciones de Administración para el rol administrador. Se guardan para todos aunque la bandera esté oculta, así que al publicarla cada participante ve lo que ya recibió. Los correos, la billetera y el banner de regalos de créditos no dependen de esta bandera.",
    // Launched by flipping it, once an admin has seen the release work: a
    // public default would launch with the first request after deploy.
    defaultVisibility: "admin_only",
  },
  push_notifications: {
    label: "Notificaciones en el dispositivo",
    description:
      "El control «Recibir notificaciones en este dispositivo» en la campana y en `/my_notifications`, y el envío de esas notificaciones al centro de notificaciones del teléfono o la computadora. Requiere también la bandera «Notificaciones en la app»: tocar una notificación la abre en Glitter. En iPhone llegan solo con Glitter agregado a la pantalla de inicio. Apagarla deja de enviarlas en el siguiente envío, aunque los dispositivos sigan registrados.",
    // Same as the bell: launched by flipping it once an admin has tried it.
    defaultVisibility: "admin_only",
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
