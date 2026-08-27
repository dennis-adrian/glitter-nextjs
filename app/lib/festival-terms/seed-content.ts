import {
  bold,
  bullet,
  heading,
  italic,
  link,
  numbered,
  paragraph,
  resetSeedBlockIds,
} from "@/app/lib/festival-terms/blocks";
import type { SeedTermsSection } from "@/app/lib/festival-terms/definitions";

export function buildInitialFestivalTermsSections(): SeedTermsSection[] {
  resetSeedBlockIds();

  return [
    {
      sortOrder: 0,
      kind: "rich_text",
      layout: "plain",
      title: "1. Aceptación de Términos",
      audienceCategories: [],
      audienceFestivalTypes: [],
      bodyJson: [
        paragraph(
          'Al hacer clic en "Acepto los términos y condiciones" estás suscribiendo un acuerdo vinculante con la organización. Al registrarte y participar en el festival como expositor, aceptas estar sujeto a estos Términos y Condiciones. El incumplimiento de cualquiera de estas condiciones puede derivar en consecuencias según la gravedad de la infracción: desde una advertencia formal, hasta la restricción temporal o permanente de participar en futuros festivales de la productora.',
        ),
      ],
    },
    {
      sortOrder: 1,
      kind: "rich_text",
      layout: "plain",
      title: "2. Participación en el Festival",
      audienceCategories: [],
      audienceFestivalTypes: [],
      bodyJson: [
        paragraph(
          "La participación en el festival está sujeta a las siguientes condiciones:",
        ),
        bullet([
          "Los expositores deben tener al menos 16 años de edad. Los expositores menores de 18 años deben estar presentes con un padre, madre o tutor legal durante la totalidad del evento.",
        ]),
        bullet([
          "Todos los participantes deben tener un perfil aprobado en nuestro sitio web, es decir, una cuenta que haya pasado por revisión y esté habilitada por la organización, y una reserva confirmada y pagada para su espacio.",
        ]),
        bullet([
          "La participación en el festival no constituye un derecho adquirido por haber participado en ediciones anteriores. Cada edición es evaluada de manera independiente y está sujeta a un proceso de curaduría interna.",
        ]),
        bullet([
          "La organización podrá evaluar el historial de cumplimiento de normas, la alineación con la identidad del evento, la calidad de la propuesta y otros criterios internos antes de aprobar una participación.",
        ]),
        bullet([
          "Todos los participantes deben cuidar la estética de su stand para que sea atractiva para el público. ",
          bold(
            "Es requerido que cada stand tenga un mantel que cubra completamente el frente de la mesa llegando casi hasta el suelo, sin arrastrarlo.",
          ),
        ]),
        bullet([
          "Solo se permite tener a dos personas trabajando en el stand. Cada persona con su credencial correspondiente. Tener a más de dos personas y/o personas sin credencial en el stand sin autorización puede resultar en penalizaciones para participaciones futuras.",
        ]),
        bullet([
          "Los expositores deben cumplir con todas las reglas del festival, regulaciones e instrucciones del personal del festival.",
        ]),
        bullet([
          "El staff del festival hará un recorrido por el recinto para verificar que los expositores cumplen con las reglas del festival.",
        ]),
        bullet([
          "El expositor es responsable de su mercadería y objetos personales. La organización no se responsabiliza por robos, daños o pérdidas ocurridas durante el festival",
        ]),
      ],
    },
    {
      sortOrder: 2,
      kind: "rich_text",
      layout: "plain",
      title: null,
      audienceCategories: ["illustration"],
      audienceFestivalTypes: ["festicker"],
      bodyJson: [
        bullet([
          "Los participantes en la categoría de ilustración deben tener al menos el 80% de su stand ocupado con stickers. Otros productos pueden ser comercializados pero deben estar organizados en muestrarios o exhibidores de manera que no signifiquen más del 20% del espacio. El incumplimiento de este requisito puede resultar en penalizaciones para participaciones futuras.",
        ]),
      ],
    },
    {
      sortOrder: 3,
      kind: "rich_text",
      layout: "plain",
      title: null,
      audienceCategories: ["illustration"],
      audienceFestivalTypes: [],
      bodyJson: [
        bullet([
          bold(
            'Para mejorar la experiencia del "Stand de Trueque" del festival, todos los participantes en la categoría de ilustración deberán donar 3 stickers. Estos stickers serán solicitados al artista durante el festival por un miembro designado del staff que pasará por su stand',
          ),
        ]),
      ],
    },
    {
      sortOrder: 4,
      kind: "rich_text",
      layout: "plain",
      title: "2.1. Sector de gastronomía",
      audienceCategories: ["gastronomy"],
      audienceFestivalTypes: [],
      bodyJson: [
        paragraph(
          "El sector gastronómico constituye una categoría especial dentro del festival y está sujeto a un proceso de evaluación previo a la confirmación de participación. Esta evaluación busca mantener una oferta equilibrada y coherente con la identidad del evento.",
        ),
        paragraph(
          bold(
            "A partir de 2026, en la categoría de gastronomía la aceptación de estos Términos y Condiciones constituye una postulación. La participación no está garantizada y solo las postulaciones aprobadas para este evento podrán realizar una reserva.",
          ),
        ),
        bullet([
          "La organización podrá solicitar fotografías actualizadas del stand y una descripción detallada del menú como parte del proceso de evaluación.",
        ]),
        bullet([
          "La selección considerará criterios como variedad de la oferta, calidad de presentación y antecedentes de cumplimiento de las normas en ediciones anteriores.",
        ]),
        bullet([
          "La aprobación final dentro del sector gastronómico queda a criterio exclusivo de la organización y es de carácter discrecional.",
        ]),
        paragraph(
          bold("Presentación y estética del stand: "),
          "Todos los stands deberán cumplir con un estándar mínimo de presentación visual y estética acorde a la identidad del evento. No se permitirán montajes improvisados, envases de uso doméstico, carteles manuscritos o materiales que no formen parte de una propuesta visual cuidada y coherente. La organización se reserva el derecho de solicitar ajustes o rechazar stands que no cumplan con estos lineamientos.",
        ),
      ],
    },
    {
      sortOrder: 5,
      kind: "rich_text",
      layout: "accordion",
      title: "3. Reservas, Pagos y Cancelaciones",
      audienceCategories: [],
      audienceFestivalTypes: [],
      bodyJson: [
        bullet([
          "Toda reserva debe ser pagada en su totalidad hasta 5 días o 120 horas después de creada la reserva. En caso de no hacerlo, la reserva será cancelada automáticamente, el espacio será liberado y el participante no podrá participar en el festival.",
        ]),
        bullet([
          "La reserva se confirma al realizar el pago correspondiente. El estado de la reserva puede tomar hasta 48 horas en actualizarse en el sitio web, contadas a partir del momento en que el participante haya subido el comprobante de pago en el sitio web.",
        ]),
        bullet([
          "Las reservas confirmadas que sean canceladas a más de 30 días antes del evento recibirán un reembolso del 75%.",
        ]),
        bullet([
          "Las reservas confirmadas que sean canceladas entre 20 y 30 días antes del evento recibirán un reembolso del 50%.",
        ]),
        bullet([
          "No se proporcionarán reembolsos para cancelaciones realizadas con menos de 20 días de anticipación al evento.",
        ]),
        bullet([
          "En caso de cancelación de todo el festival debido a circunstancias fuera del control de los organizadores (incluyendo pero no limitado a desastres naturales, emergencias públicas, estallidos sociales u órdenes gubernamentales), los reembolsos pueden proporcionarse a discreción de los organizadores.",
        ]),
        bullet([
          "Las reservas de stands no son transferibles a menos que sea explícitamente permitido por los organizadores del festival.",
        ]),
        bullet([
          "En caso de no presentarse al evento sin haber cancelado la reserva previamente, se registrará una infracción formal en el sistema, lo que puede derivar en restricciones para la reserva de espacios en futuros festivales. Se considera aviso previo cualquier comunicación enviada a la organización con al menos 48 horas de anticipación al inicio del evento.",
        ]),
        paragraph(
          "Cancelar una reserva puede resultar en penalizaciones para participaciones en futuros festivales de la productora.",
        ),
        paragraph(
          bold("Evaluación de materiales: "),
          "Los expositores que no hayan participado previamente en otros festivales de la productora, deberán subir imágenes de los productos que comercializarán en su espacio. Estas imágenes se subirán a la plataforma designada por la organización y hasta la fecha comunicada luego de hecha la reserva, para su evaluación interna. En caso de incumplimiento o en caso de que el material subido vaya en contra de alguno de los términos y condiciones, la reserva será cancelada automáticamente, el espacio será liberado y el participante no podrá participar en el festival.",
        ),
      ],
    },
    {
      sortOrder: 6,
      kind: "rich_text",
      layout: "accordion",
      title: "Reservas compartidas (ilustración)",
      audienceCategories: ["illustration"],
      audienceFestivalTypes: [],
      bodyJson: [
        bullet([
          "Los ilustradores que quieran compartir espacio deben agregar a su compañero al momento de hacer la reserva. Todo ilustrador debe tener un perfil aprobado y debe haber aceptado los términos y condiciones para poder ser agregado como compañero. No se aceptarán cambios una vez hecha la reserva.",
        ]),
      ],
    },
    {
      sortOrder: 7,
      kind: "rich_text",
      layout: "accordion",
      title: "Reservas individuales",
      audienceCategories: ["entrepreneurship", "gastronomy"],
      audienceFestivalTypes: [],
      bodyJson: [
        bullet([
          "Las reservas son individuales y no se permiten a ningún otro expositor más que el propio que hizo la reserva. No se permiten reservas compartidas.",
        ]),
      ],
    },
    {
      sortOrder: 8,
      kind: "rich_text",
      layout: "accordion",
      title: "Participación en Festicker (emprendimiento)",
      audienceCategories: ["entrepreneurship"],
      audienceFestivalTypes: ["festicker"],
      bodyJson: [
        bullet([
          "Para participar del Festicker los expositores deberán repartir stickers con su logo y/o información de contacto en lugar de tarjetas de presentación comunes.",
        ]),
      ],
    },
    {
      sortOrder: 9,
      kind: "schedule",
      layout: "accordion",
      title: "4. Horarios, Montaje y Desmontaje de Stands",
      audienceCategories: [],
      audienceFestivalTypes: [],
      bodyJson: null,
    },
    {
      sortOrder: 10,
      kind: "rich_text",
      layout: "accordion",
      title: "5. Código de Conducta",
      audienceCategories: [],
      audienceFestivalTypes: [],
      bodyJson: [
        paragraph("Se espera que todos los expositores:"),
        bullet([
          "Traten a otros expositores, asistentes, y personal con respeto y cortesía.",
        ]),
        bullet([
          "Respeten el espacio asignado y no lo extiendan más allá de los límites del stand.",
        ]),
        bullet([
          "Mantengan todo contenido para adultos (explícito, erótico o con violencia gráfica) debidamente cubierto y disponible únicamente bajo solicitud directa del cliente.",
        ]),
        bullet([
          "Se abstengan de cualquier comportamiento que pueda causar incomodidad, miedo o daño a otros.",
        ]),
        bullet([
          "No participen en ninguna forma de acoso, discriminación o comportamiento amenazante, ya sea en persona, en redes sociales o en cualquier plataforma digital, hacia otros expositores, asistentes, staff o la organización.",
        ]),
        bullet([
          "No posean ni usen sustancias ilegales. Ni se encuentren en el evento bajo la influencia del alcohol o de sustancias ilegales.",
        ]),
        bullet([
          bold(
            "Mantengan el área de su stand limpia y segura durante todo el festival, no dejen basura o residuos en el stand y en caso de derramar algún líquido o alimento, hacerse cargo de la limpieza del espacio.",
          ),
        ]),
        bullet([
          "No publiquen, compartan ni reproduzcan el trabajo, los productos o la imagen de otros expositores en redes sociales sin su consentimiento explícito.",
        ]),
        bullet([
          "Cuiden la imagen del festival en sus publicaciones: eviten compartir contenido que pueda afectar negativamente su reputación o la de la organización.",
        ]),
        paragraph(
          "La violación de este código de conducta puede resultar en la expulsión inmediata del festival sin reembolso y/o la prohibición de participar en futuros festivales de la productora.",
        ),
      ],
    },
    {
      sortOrder: 11,
      kind: "rich_text",
      layout: "accordion",
      title: "Responsabilidad en stands compartidos",
      audienceCategories: ["illustration"],
      audienceFestivalTypes: [],
      bodyJson: [
        paragraph(bold("Responsabilidad compartida en stands compartidos:")),
        paragraph(
          "En caso de que un ilustrador comparta stand con otro, ambos serán responsables por el cumplimiento de las normas. Cualquier infracción cometida por uno de los ilustradores, sus acompañantes o el equipo presente en el stand podrá generar sanciones que afecten a ambos participantes.",
        ),
      ],
    },
    {
      sortOrder: 12,
      kind: "rich_text",
      layout: "accordion",
      title: "6. Fotografía y Grabación",
      audienceCategories: [],
      audienceFestivalTypes: [],
      bodyJson: [
        paragraph("Al participar en el festival, das tu consentimiento para:"),
        bullet([
          "Que tu stand o espacio sea fotografiado, filmado o grabado por los organizadores del festival o sus representantes designados (los expositores y/o acompañantes pueden optar no ser parte de la fotografía o video).",
        ]),
        bullet([
          "El uso de tu stand, productos, logotipo, imágenes del personal y semejanza en fotografías, videos y grabaciones con fines promocionales, comerciales y de archivo sin compensación.",
        ]),
        bullet([
          "Que los organizadores del festival posean todos los derechos de cualquier fotografía, video y grabación oficial tomada durante el festival.",
        ]),
        paragraph(
          "Los expositores pueden tomar fotografías y grabaciones de su propio stand con fines promocionales.",
        ),
      ],
    },
    {
      sortOrder: 13,
      kind: "rich_text",
      layout: "accordion",
      title: "7. Artículos y Actividades Prohibidas",
      audienceCategories: [],
      audienceFestivalTypes: [],
      bodyJson: [
        paragraph("Los siguientes artículos y actividades están prohibidos:"),
        bullet([
          "Armas de cualquier tipo, incluyendo pero no limitado a armas de fuego, cuchillos y gas pimienta",
        ]),
        bullet(["Sustancias ilegales"]),
        bullet([
          "Materiales inflamables sin las medidas de seguridad adecuadas y aprobaciones",
        ]),
        bullet([
          "Sistemas de audio fuertes que interfieran con los espacios vecinos",
        ]),
        bullet([
          "El uso de luces parpadeantes o estroboscópicas de cualquier tipo en el stand.",
        ]),
        bullet([
          "Distribución de materiales de marketing fuera del área de stand asignada",
        ]),
        bullet([
          "Distribución o comercialización de productos discriminatorios y/o que inciten al odio",
        ]),
        bullet([
          "Compartir stand en sectores o categorías no especificadas. Solo pueden compartir stand quienes sean parte de la categoría de ilustración",
        ]),
        bullet([
          "Comercializar productos elaborados con inteligencia artificial o que utilicen tecnologías de IA",
        ]),
        bullet([
          "Vender productos que no sean de autoría propia o tengan como base contenido de terceros sin el consentimiento del creador. (Consideramos los fan-arts aceptables más no el calco de imágenes)",
        ]),
        bullet([
          "Ofrecer servicios, vender o regalar productos de terceros que no estén inscritos en el festival o que no sean parte de la reserva del stand.",
        ]),
        bullet([
          "Cualquier actividad que viole las leyes o regulaciones locales",
        ]),
        bullet([
          "La presencia de animales o mascotas de cualquier tipo en el stand o en el recinto del festival sin autorización previa de la organización.",
        ]),
        paragraph(
          bold(
            "Prohibición de venta de material de expositores inhabilitados: ",
          ),
          "No está permitido vender productos elaborados por expositores cuyo perfil esté deshabilitado en el sitio web oficial del evento. Tampoco se permitirá la venta de material colaborativo si uno de los involucrados tiene el perfil deshabilitado. Esta medida busca garantizar que solo participen y comercialicen productos los expositores debidamente registrados y habilitados.",
        ),
        paragraph(
          bold(
            "Prohibición de acreditación como acompañante a perfiles deshabilitados: ",
          ),
          "No está permitido que una persona con perfil deshabilitado participe en el evento de ninguna manera, ni utilizando el credencial de acompañante asignada a otro expositor. Esta medida aplica especialmente a los casos en los que un participante habilitado intente acreditar como acompañante o miembro de su equipo de trabajo a una persona previamente deshabilitada. En caso de detectarse esta situación, se podrán aplicar sanciones al titular del espacio.",
        ),
      ],
    },
    {
      sortOrder: 14,
      kind: "rich_text",
      layout: "accordion",
      title: "Sector de gastronomía",
      audienceCategories: ["gastronomy"],
      audienceFestivalTypes: [],
      bodyJson: [
        heading(3, "Sector de gastronomía"),
        bullet(
          [
            "Por motivos de patrocinio, exclusividad y alineación con la temática del evento, no se permite la venta de los siguientes productos.",
          ],
          [
            numbered(["Bebidas alcohólicas o que contengan alcohol"]),
            numbered(["Sopas de ramen"]),
            numbered([
              "Productos o alimentos que generen olores fuertes o desagradables",
            ]),
            numbered(["Pipocas*"]),
            numbered(["Gaseosas*"]),
            numbered(["Panchitos o ", italic("hot dogs"), " en general*"]),
          ],
        ),
        paragraph(
          "* Estos productos están designados para el stand de comida de la productora del festival, el cual nos ayuda a generar ingresos para seguir creando futuros festivales.",
        ),
        bullet([
          "Los productos que el expositor ofrezca a la venta deben estar previamente preparados. Recalcar que no se permite el uso de garrafas o cualquier artefacto que provoque fuego.",
        ]),
        bullet([
          "No está permitido ofrecer productos afuera del espacio asignado a su stand",
        ]),
        bullet([
          "La manipulación de alimentos debe realizarse con las medidas de higiene adecuadas.",
        ]),
        paragraph(
          "La violación de estas prohibiciones puede resultar en la expulsión inmediata del festival sin reembolso.",
        ),
      ],
    },
    {
      sortOrder: 15,
      kind: "rich_text",
      layout: "accordion",
      title: "8. Resolución de Conflictos",
      audienceCategories: [],
      audienceFestivalTypes: [],
      bodyJson: [
        bullet([
          "Los conflictos entre expositores durante el evento serán mediados por el staff del festival, cuya resolución es definitiva en el contexto del evento.",
        ]),
        bullet([
          "Las disputas con la organización deben comunicarse por escrito al correo expositores@productoraglitter.com dentro de los 15 días posteriores a la fecha del evento. La organización responderá dentro de los 10 días hábiles siguientes.",
        ]),
      ],
    },
    {
      sortOrder: 16,
      kind: "rich_text",
      layout: "accordion",
      title: "9. Modificaciones a los Términos",
      audienceCategories: [],
      audienceFestivalTypes: [],
      bodyJson: [
        paragraph(
          "La organización se reserva el derecho de actualizar o modificar estos Términos y Condiciones en cualquier momento. Los cambios serán comunicados con al menos 15 días de anticipación a través de la plataforma y/o por correo electrónico. La participación continuada en festivales de la productora tras la entrada en vigencia de los nuevos términos implica la aceptación de los mismos.",
        ),
      ],
    },
    {
      sortOrder: 17,
      kind: "rich_text",
      layout: "accordion",
      title: "10. Información de Contacto",
      audienceCategories: [],
      audienceFestivalTypes: [],
      bodyJson: [
        paragraph(
          "Para preguntas o inquietudes sobre estos Términos y Condiciones, por favor contacte a los organizadores del festival en:",
        ),
        paragraph("Email: expositores@productoraglitter.com"),
      ],
    },
    {
      sortOrder: 18,
      kind: "rich_text",
      layout: "card",
      title: "¡Forma parte de nuestra comunidad!",
      audienceCategories: [],
      audienceFestivalTypes: [],
      bodyJson: [
        paragraph(
          "Formás parte de nuestra comunidad y podés ayudarnos a llegar a más personas — lo que también significa más público en el festival y más ojos en tu stand. La forma más efectiva de lograrlo es interactuando con nuestro contenido: dale like a nuestras publicaciones e historias en ",
          link("https://www.instagram.com/glitter.bo", "Instagram"),
          ", comentá lo que se te ocurra en nuestros videos de ",
          link("https://www.tiktok.com/@glitter.bo", "TikTok"),
          ", y compartí lo que te guste. Eso es lo que realmente hace que la comunidad crezca.",
        ),
      ],
    },
  ];
}
