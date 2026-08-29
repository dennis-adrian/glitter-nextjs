import type { LandingPageContentV1 } from "./definitions";

const asset = (name: string) => `/img/landing-v4/${name}`;

export const DEFAULT_COMMUNITY_GALLERY: LandingPageContentV1["sections"]["community"]["gallery"] =
  [
    {
      id: "b1b7d8f0-d8b9-4c77-a28f-2b4a1b6c5111",
      image: {
        url: "/img/landing-carousel/hanon-show.png",
        alt: "Público participando en una actividad sobre el escenario de Glitter",
      },
    },
    {
      id: "b1b7d8f1-d8b9-4c77-a28f-2b4a1b6c5112",
      image: {
        url: "/img/landing-carousel/sticker-stand.png",
        alt: "Muestra de stickers de un participante",
        focalPoint: { x: 40.1, y: 48 },
      },
    },
    {
      id: "b1b7d8f2-d8b9-4c77-a28f-2b4a1b6c5113",
      image: {
        url: "/img/landing-carousel/illustrations.png",
        alt: "Ilustraciones exhibidas en un stand de artistas",
        focalPoint: { x: 51.2, y: 49.8 },
      },
    },
    {
      id: "b1b7d8f3-d8b9-4c77-a28f-2b4a1b6c5114",
      image: {
        url: "/img/landing-carousel/silksong.png",
        alt: "Visitantes en cosplay posando para la foto",
      },
    },
    {
      id: "b1b7d8f4-d8b9-4c77-a28f-2b4a1b6c5115",
      image: {
        url: "/img/landing-carousel/cookies.jpg",
        alt: "Galletas artesanales de colores en un stand gastronómico",
      },
    },
    {
      id: "b1b7d8f5-d8b9-4c77-a28f-2b4a1b6c5116",
      image: {
        url: "/img/landing-carousel/earrings.png",
        alt: "Aretes artesanales exhibidos en un stand creativo",
        focalPoint: { x: 43, y: 43.4 },
      },
    },
    {
      id: "b1b7d8f6-d8b9-4c77-a28f-2b4a1b6c5117",
      image: {
        url: "/img/landing-carousel/ceramics.png",
        alt: "Piezas de cerámica coloridas creadas por artistas locales",
        focalPoint: { x: 30.4, y: 31.2 },
      },
    },
    {
      id: "b1b7d8f7-d8b9-4c77-a28f-2b4a1b6c5118",
      image: {
        url: "/img/landing-carousel/bees.png",
        alt: "Par de abejas hechas con crochet",
        focalPoint: { x: 50.1, y: 62 },
      },
    },
  ];

/** The code fallback used until the first publication is created. */
export const DEFAULT_LANDING_PAGE_CONTENT: LandingPageContentV1 = {
  schemaVersion: 1,
  announcement: {
    display: "rotating",
    rotationIntervalSeconds: 6,
    items: [],
  },
  seo: {
    title: "Productora Glitter | Festivales creativos en Bolivia",
    description:
      "Festivales, arte independiente y experiencias creativas en Santa Cruz, Bolivia.",
    shareImageUrl: asset("theo-standard-hero.png"),
  },
  hero: {
    titleLead: "El lugar para tu",
    titleAccent: "creatividad",
    body: "Creamos espacios acogedores y seguros para que ilustradores y emprendimientos creativos puedan impulsar sus ideas.",
    image: {
      url: asset("theo-standard-hero.png"),
      alt: "Theo llevando materiales para un stand creativo",
    },
    primaryCta: {
      label: "Quiero participar",
      href: "#participa",
      show: true,
    },
    secondaryCta: {
      label: "Próximo festival",
      href: "#proximo-evento",
      show: true,
    },
  },
  sectionOrder: [
    "marketing_banners",
    "event_spotlight",
    "festival_family",
    "audience",
    "community",
    "partners",
  ],
  sectionBackgrounds: {
    marketing_banners: "default",
    event_spotlight: "default",
    audience: "default",
    festival_family: "default",
    community: "default",
    partners: "default",
  },
  sections: {
    marketingBanners: { enabled: false },
    eventSpotlight: {
      enabled: true,
      source: "active",
      festivalId: null,
      primaryCta: {
        label: "Obtener entrada",
        destination: "registration",
        href: null,
        show: true,
      },
      secondaryCta: {
        label: "Ver festival",
        destination: "festival",
        href: null,
        show: true,
      },
    },
    audience: {
      enabled: true,
      heading: "Elegí cómo vivir Glitter",
      items: [
        {
          id: "1a1ad318-4bbd-4dfe-9f71-a83992c6c41a",
          title: "Artista o expositor",
          description:
            "Mostrá tu arte, vendé tus productos y conectá con una comunidad que valora lo hecho con imaginación.",
          image: {
            url: "/img/landing-audiences/participants.png",
            alt: "Personajes atendiendo un puesto creativo",
          },
          cta: {
            label: "Ver cómo participar",
            href: "/sign_up",
            show: false,
          },
          featured: false,
        },
        {
          id: "4b5111fc-4340-4689-a7bd-e9482652479b",
          title: "Visitante",
          description:
            "Vení por stickers, prints, ropa, amigurimis, talleres, comida y mucho más. Descubrí todo lo que podés vivir en el próximo festival.",
          image: {
            url: "/img/landing-audiences/visitors.png",
            alt: "Visitante disfrutando una bebida durante el festival",
          },
          cta: {
            label: "Ver próximo evento",
            href: "#proximo-evento",
            show: false,
          },
          featured: false,
        },
        {
          id: "1de7ac55-cc2d-4982-a744-efd2a743b70e",
          title: "Auspiciador",
          description:
            "Impulsá el arte boliviano y acercá tu marca a una comunidad joven, creativa y en crecimiento.",
          image: {
            url: "/img/landing-audiences/sponsors.png",
            alt: "Personaje sosteniendo un cartel para marcas aliadas",
          },
          cta: {
            label: "Ver opciones de auspicio",
            href: "#alianzas",
            show: false,
          },
          featured: false,
        },
      ],
    },
    festivalFamily: {
      enabled: true,
      heading: "Tres festivales. Tres mundos.",
      body: "Nacieron en el mismo lugar, pero cada uno tiene su propia forma de imaginar, crear y celebrar.",
      items: [
        {
          id: "1f275993-4273-4d30-bfef-0c835cfa028c",
          festivalType: "glitter",
          displayName: "Glitter",
          badge: "Festival creativo",
          description:
            "El festival que dio inicio a esta aventura. Todos lo que podés imaginar lo encontrás en este mundo con mucho por explorar",
          fallbackImage: {
            url: "/img/landing-festivals/glitter-characters.png",
            alt: "Personajes animales que forman parte del universo de Glitter",
            focalPoint: { x: 50, y: 50 },
          },
          href: null,
          showCta: false,
        },
        {
          id: "e20f3377-0cd0-4f1f-b3f8-0e6af074b55a",
          festivalType: "festicker",
          displayName: "Festicker",
          badge: "Festival urbano",
          description:
            "Pegate a la onda de los stickers y la cultura urbana. Descubrí diferentes formas de expresarte",
          fallbackImage: {
            url: "/img/landing-festivals/festicker-characters.png",
            alt: "Los cuatro personajes del universo urbano de Festicker",
            focalPoint: { x: 50, y: 50 },
          },
          href: "/festivals/festicker",
          showCta: false,
        },
        {
          id: "fc879379-2696-4ca7-a1a6-0e27f40dcc37",
          festivalType: "twinkler",
          displayName: "Twinkler",
          badge: "Festival mágico",
          description:
            "Un mundo encantado de hadas, brujas y criaturas que despiertan la imaginación.",
          fallbackImage: {
            url: "/img/landing-festivals/cosplay-twinkler.png",
            alt: "Personaje con vestuario de bruja junto a una criatura mágica de Twinkler",
            focalPoint: { x: 50, y: 50 },
          },
          href: null,
          showCta: false,
        },
      ],
    },
    community: {
      enabled: true,
      heading: "Momentos para compartir",
      body: "Una galería de lo que hace especial a nuestros festivales",
      testimonialHeading: "Comentarios de participantes",
      gallery: DEFAULT_COMMUNITY_GALLERY,
      testimonials: [],
    },
    partners: {
      enabled: false,
      heading: "Con el apoyo de marcas que creen en el talento nacional",
      items: [
        "CBA Santa Cruz",
        "Tigo Bolivia",
        "UPSA Creativa",
        "Huari",
        "AECID",
      ].map((name, index) => ({
        id: `d232a130-03a8-40ad-9021-57dc45c2190${index}`,
        name,
        image: null,
        href: null,
      })),
      sponsorCta: {
        heading: "Hagamos brillar tu marca",
        body: "Convertite en aliado estratégico de una comunidad joven, creativa y comprometida con el arte independiente boliviano. Diseñemos una activación memorable para tu marca.",
        image: { url: asset("theo-and-bunny.png"), alt: "Theo y Bunny" },
        email: "sponsors@productoraglitter.com",
        emailLabel: "Escríbinos a:",
        buttonLabel: "Solicitá el dossier",
        emailSubject: "Dossier de alianzas Glitter",
        showButton: true,
      },
    },
  },
  footer: {
    logo: {
      url: "/img/logo/glitter-logo-full-primary-1696x739.png",
      alt: "Productora Glitter",
    },
    description:
      "Produciendo momentos inspiradores y llenos de creatividad desde Santa Cruz, Bolivia.",
    festivalLinks: [
      { label: "Glitter", href: "#festivales" },
      { label: "Twinkler", href: "#festivales" },
      { label: "Festicker", href: "/festivals/festicker" },
    ],
    communityLinks: [
      {
        label: "Participá en nuestro escenario",
        href: "/presentaciones-en-vivo",
      },
    ],
    contactEmail: "info@productoraglitter.com",
    location: "Santa Cruz, Bolivia",
    copyrightText: "Productora Glitter. Todos los derechos reservados.",
    socialLinks: [
      {
        id: "c4e1e10f-1b74-40f7-aae4-7fa3e8ac1baf",
        network: "instagram",
        label: "Instagram Glitter",
        href: "https://www.instagram.com/glitter.bo",
      },
      {
        id: "465d87b2-ae6f-45bc-b146-2fae83a86169",
        network: "facebook",
        label: "Facebook",
        href: "https://www.facebook.com/glitterfestival",
      },
      {
        id: "b1291041-247f-46ec-aab7-449d000f343e",
        network: "tiktok",
        label: "TikTok",
        href: "https://www.tiktok.com/@glitter.bo",
      },
    ],
  },
};
