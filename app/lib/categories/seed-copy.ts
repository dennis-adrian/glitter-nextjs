import type { ManagementArea } from "@/app/lib/categories/definitions";
import { normalizeCategoryLabel } from "@/app/lib/categories/label";

export type SeedCategoryCopy = {
  title: string;
  area: ManagementArea;
  paragraphs: string[];
  /** When set, used as description_html instead of wrapping paragraphs. */
  htmlOverride?: string;
  insertIfMissing?: boolean;
};

const ILLUSTRATION_PARAGRAPHS = [
  "¿Realizas Ilustración digital o tradicional? ¿Tenes productos como pines, stickers, llaveros con ilustraciones propias? ¡Ésta es tu categoría!",
  "Los ilustradores forman el 60% de los espacios en el festival mostrando ilustraciones originales que ellos mismos han realizado.",
];

const GASTRONOMY_PARAGRAPHS = [
  "¿Quiénes pueden ser parte de la categoría Gastronomía?",
  "Esta categoría permite únicamente emprendimientos con productos ya elaborados, empaquetados o listos para servir. El festival no cuenta con la disponibilidad de aceptar cocinas, carritos con garrafas ni equipo que pueda provocar fuego. Tampoco están permitidos los alimentos que generen olores fuertes por ejemplo: ramen de queso ni bebidas o postres con alcohol.",
  "En esta categoría nos han acompañado emprendimientos de: Brownies, galletas, sandwiches, masitas, tortas, bubble teas y cafeterías.",
];

export const HARDCODED_CATEGORY_COPY: SeedCategoryCopy[] = [
  {
    title: "Ilustración",
    area: "illustration",
    paragraphs: ILLUSTRATION_PARAGRAPHS,
  },
  {
    title: "Ilustración Digital",
    area: "illustration",
    paragraphs: ILLUSTRATION_PARAGRAPHS,
    insertIfMissing: true,
  },
  {
    title: "Crochet",
    area: "entrepreneurship",
    paragraphs: [
      "¿Realizas peluches (amigurumis), flores, prendas y decoraciones tejidas a ganchillo o gancho? Sí es así, ¡el crochet es lo tuyo!",
      "La categoría crochet se ha abierto gracias a la alta demanda de artistas de crochet que han participado del festival.",
    ],
  },
  {
    title: "Bisutería / Bijouteria",
    area: "entrepreneurship",
    paragraphs: [
      "El arte de la bisutería / bijouteria consiste en el armado de manillas, collares, aretes, etc., a partir de la mano creativa de su creador que elige cuidadosamente las perlas, dijes y demás accesorios variados similares a la joyería.",
      "En nuestros festivales se ha abierto la categoría Bisutería/Bijouteria para aquellos emprendimientos que deseen mostrar y vender estos accesorios.",
    ],
  },
  {
    title: "Arte en vidrio",
    area: "entrepreneurship",
    paragraphs: [
      "¿Haces collage con vidrios? ¿Pintas sobre vidrio? ¿O quizás armas piezas decorativas en vidrio? Si tu arte involucra el vidrio como su atractivo principal, ¡esta es tu categoría!",
      "El arte sobre el cristal empezó a gozar de mayor popularidad en los últimos años por su versatilidad y su belleza en el material, que resalta la pintura y la composición de cualquier pieza.",
      "El festival abre la categoría para aquellos artistas que realicen su arte en este material.",
    ],
  },
  {
    title: "Arte en papel / Papercraft",
    area: "entrepreneurship",
    paragraphs: [
      "¿Tenes habilidad para las manualidades en distintos tipos de papel? El arte en este material que para muchos quizás sea algo muy común, puede hacer volar nuestra imaginación; desde origami, escultura en papel, collages, recortes, modelos 3D hechos a mano, hasta rosas eternas ¡todo en esta categoría!",
    ],
  },
  {
    title: "Arte en madera",
    area: "entrepreneurship",
    paragraphs: [
      "Lo atemporal, lo natural y la destreza del artista se unen en las piezas únicas de la madera. Dentro de este arte se puede hallar la pintura en madera, escultura con madera, escritura sobre madera, tallado en madera, y muchos más.",
      "Si tus creaciones involucran este maravilloso material, ¡esta es tu categoría!",
    ],
  },
  {
    title: "Arte en arcilla",
    area: "entrepreneurship",
    paragraphs: [
      "Desde tazas, platos, ceniceros, hasta esculturas de animalitos, ¡la arcilla es un material que permite la creación de un montón de maravillas!",
      "Si eres un artista que realiza sus obras en arcilla, ¡el festival creó esta categoría para vos!",
    ],
  },
  {
    title: "Porcelana fría",
    area: "entrepreneurship",
    paragraphs: [
      "Para los amantes de las manualidades, ¡la porcelana fría es el material perfecto para realizar modelados únicos y divertidos!",
      "El festival recibe artistas que ofrecen todo tipo de producto realizado a mano con este material.",
      "Si tus piezas son creadas a partir de porcelana fría, ¡tu categoría está aquí!",
    ],
  },
  {
    title: "Diseño y confección",
    area: "entrepreneurship",
    paragraphs: [
      "¡Moda, costura y mucho estilo! El arte del diseño y la confección se trata de la creación de prendas únicas y muy chicks.",
      "Si eres diseñador/a de moda y cuentas con tu propia línea de ropa, ya sea poleras, jeans, vestidos, faldas, zapatos, carteras, etc., entonces llegaste al lugar correcto.",
    ],
  },
  {
    title: "Encuadernación",
    area: "entrepreneurship",
    paragraphs: [
      "¿Realizas tus propios cuadernos, libretas, diarios y otros de manera artesanal?",
      "La encuadernación consiste en la unión de pliegues de papel unidos y sujetos por ambos lados de una tapa resistente, con el fin de mantener en orden y a salvo las páginas. Y además, ¡puedes dotarlas de diseños únicos!",
      "Además, si te dedicas a la personalización de diarios o álbumes a partir de recortes varios, manualidades o cualquier tipo de elemento, ¡también te tomamos en cuenta!",
      "¿La encuadernación es lo tuyo? ¡Estás en el lugar correcto!",
    ],
  },
  {
    title: "Bordado",
    area: "entrepreneurship",
    paragraphs: [
      "El fino arte que requiere dedicación y paciencia. Consiste en aplicar mediante hilos de diversos colores y aguja una decoración en una tela lisa, también denominada fondo.",
      "El bordado es magnífico por los patrones y diseños que puede formar sobre la tela. ¡Es como dibujar pero con hilo y aguja!",
      "Si el bordado es lo tuyo, ¡esta es tu categoría!",
    ],
  },
  {
    title: "Pintura",
    area: "entrepreneurship",
    paragraphs: [
      "Óleo, acuarela, gouache, témpera, acrílico, pastel o tinta, la pintura es un arte tan amplio y que requiere de tantos conocimientos que su práctica se conserva a pesar de su longevidad.",
      "Sea cual sea tu técnica, estilo o inspiración, ¡prepara tus lienzos! ¡Esta es tu categoría!",
    ],
  },
  {
    title: "Libros y cómics",
    area: "entrepreneurship",
    paragraphs: [
      "El mundo del arte no se olvida del amplio mundo de las letras, la ficción, la prosa y la narrativa. En Glitter nos encanta sumirnos en la fantasía de las historias que los autores nacionales tienen para nosotros.",
      "Si eres un autor boliviano independiente, o cuentas con colecciones de libros, cómics y/o mangas variados, tanto nacionales como internacionales, ¡tu categoría está aquí!",
    ],
  },
  {
    title: "Coleccionables",
    area: "entrepreneurship",
    paragraphs: [
      "Está categoría es para aquellos que venden productos coleccionables. Figuras, vinilos, cómics, muñecas o artículos.",
    ],
  },
  {
    title: "Skincare",
    area: "entrepreneurship",
    paragraphs: [
      "La categoría skincare fue creada para que emprendimientos de belleza que están empezando, puedan darse a conocerse. Esta categoría no permite que puedan comercializar ningún producto que no esté relacionado con el skincare. Por ejemplo: Stickers, tazas, poleras, pines, llaveros, papelería.",
    ],
  },
  {
    title: "Gastronomía",
    area: "gastronomy",
    paragraphs: GASTRONOMY_PARAGRAPHS,
  },
  {
    title: "Postres",
    area: "gastronomy",
    paragraphs: GASTRONOMY_PARAGRAPHS,
    insertIfMissing: true,
  },
  {
    title: "Sublimación colaborativa",
    area: "entrepreneurship",
    paragraphs: [
      "Nos interesan mucho los ilustradores y artistas que vienen al festival, por ello, si tienes un emprendiendo de sublimación en poleras, llaveros, tazas, gorras, etc., y gustas ser parte de Glitter, puedes hacerlo únicamente si los diseños de los productos que ofreces son colaborativos o pagados a un ilustrador.",
      "El festival no permite la venta de productos con imágenes sacadas de internet. Si quieres ser parte de esta categoría, comunícate con el equipo Glitter al correo equipo@productoraglitter.com",
    ],
    htmlOverride: `<p>Nos interesan mucho los ilustradores y artistas que vienen al festival, por ello, si tienes un emprendiendo de sublimación en poleras, llaveros, tazas, gorras, etc., y gustas ser parte de Glitter, puedes hacerlo únicamente si los diseños de los productos que ofreces son colaborativos o pagados a un ilustrador.</p><p>El festival no permite la venta de productos con imágenes sacadas de internet. Si quieres ser parte de esta categoría, comunícate con el equipo Glitter al correo <a href="mailto:equipo@productoraglitter.com">equipo@productoraglitter.com</a></p>`,
  },
];

export function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function paragraphsToHtml(paragraphs: string[]): string {
  return paragraphs.map((p) => `<p>${escapeHtmlText(p)}</p>`).join("");
}

export function paragraphsToCompactBlocks(paragraphs: string[]) {
  return paragraphs.map((text, index) => ({
    id: `seed-${index + 1}`,
    type: "paragraph" as const,
    props: {
      textColor: "default",
      backgroundColor: "default",
      textAlignment: "left" as const,
    },
    content: [{ type: "text" as const, text, styles: {} }],
    children: [],
  }));
}

export function findSeedCopy(
  label: string,
  area: string,
): SeedCategoryCopy | undefined {
  const normalized = normalizeCategoryLabel(label);
  return HARDCODED_CATEGORY_COPY.find(
    (entry) =>
      entry.area === area &&
      normalizeCategoryLabel(entry.title) === normalized,
  );
}

export function unmatchedHardcodedTitles(
  existing: { label: string; category: string }[],
): string[] {
  return HARDCODED_CATEGORY_COPY.filter((entry) => {
    if (entry.insertIfMissing) return false;
    return !existing.some(
      (row) =>
        row.category === entry.area &&
        normalizeCategoryLabel(row.label) ===
          normalizeCategoryLabel(entry.title),
    );
  }).map((entry) => entry.title);
}
