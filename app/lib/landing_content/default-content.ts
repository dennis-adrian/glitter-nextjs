import type { LandingPageContentV1 } from "./definitions";

const asset = (name: string) => `/img/landing-v4/${name}`;

export const DEFAULT_COMMUNITY_GALLERY: LandingPageContentV1["sections"]["community"]["gallery"] =
  [
    {
      id: "b1b7d8f0-d8b9-4c77-a28f-2b4a1b6c5111",
      image: {
        url: "/img/landing-carousel/21 1.jpg",
        alt: "Público participando en una actividad sobre el escenario de Glitter",
      },
    },
    {
      id: "b1b7d8f1-d8b9-4c77-a28f-2b4a1b6c5112",
      image: {
        url: "/img/landing-carousel/29.jpg",
        alt: "Presentador animando al público durante un festival Glitter",
      },
    },
    {
      id: "b1b7d8f2-d8b9-4c77-a28f-2b4a1b6c5113",
      image: {
        url: "/img/landing-carousel/75.jpg",
        alt: "Ilustraciones exhibidas en un stand de artistas",
      },
    },
    {
      id: "b1b7d8f3-d8b9-4c77-a28f-2b4a1b6c5114",
      image: {
        url: "/img/landing-carousel/50.jpg",
        alt: "Visitante eligiendo artesanías tejidas a crochet",
      },
    },
    {
      id: "b1b7d8f4-d8b9-4c77-a28f-2b4a1b6c5115",
      image: {
        url: "/img/landing-carousel/10 1.jpg",
        alt: "Galletas artesanales de colores en un stand gastronómico",
      },
    },
    {
      id: "b1b7d8f5-d8b9-4c77-a28f-2b4a1b6c5116",
      image: {
        url: "/img/landing-carousel/70.jpg",
        alt: "Aretes artesanales exhibidos en un stand creativo",
      },
    },
    {
      id: "b1b7d8f6-d8b9-4c77-a28f-2b4a1b6c5117",
      image: {
        url: "/img/landing-carousel/21.jpg",
        alt: "Piezas de cerámica coloridas creadas por artistas locales",
      },
    },
    {
      id: "b1b7d8f7-d8b9-4c77-a28f-2b4a1b6c5118",
      image: {
        url: "/img/landing-carousel/34.jpg",
        alt: "Stickers de animales exhibidos durante Festicker",
      },
    },
  ];

/** The code fallback used until the first publication is created. */
export const DEFAULT_LANDING_PAGE_CONTENT: LandingPageContentV1 = {
  schemaVersion: 1,
  announcement: {
    display: "stacked",
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
    body: "Creamos espacios acogedores y seguros para que ilustradores y emprendimientos creativos puedan impulsar sus ideas en Bolivia.",
    image: {
      url: asset("theo-standard-hero.png"),
      alt: "Theo llevando materiales para un stand creativo",
    },
    primaryCta: {
      label: "Reservá tu lugar",
      href: "/festivals/festicker",
      show: true,
    },
    secondaryCta: {
      label: "Conocé los festivales",
      href: "#festivales",
      show: true,
    },
  },
  sectionOrder: [
    "marketing_banners",
    "event_spotlight",
    "audience",
    "festival_family",
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
    marketingBanners: { enabled: true },
    eventSpotlight: {
      enabled: true,
      source: "active",
      festivalId: null,
      primaryCtaLabel: "Reservá tu lugar",
      showCta: true,
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
          cta: { label: "Ver postulaciones", href: "/sign_up", show: true },
          featured: false,
        },
        {
          id: "4b5111fc-4340-4689-a7bd-e9482652479b",
          title: "Visitante",
          description:
            "Vení por stickers, prints, talleres y comida. Descubrí todo lo que podés vivir en el próximo festival.",
          image: {
            url: "/img/landing-audiences/visitors.png",
            alt: "Visitante disfrutando una bebida durante el festival",
          },
          cta: {
            label: "Ver próximos eventos",
            href: "#proximo-evento",
            show: true,
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
            label: "Conocé las alianzas",
            href: "#alianzas",
            show: true,
          },
          featured: false,
        },
      ],
    },
    festivalFamily: {
      enabled: true,
      heading: "Tres festivales. Tres mundos.",
      body: "Nacieron de la misma comunidad, pero cada uno tiene su propia forma de imaginar, crear y celebrar.",
      items: [
        {
          id: "1f275993-4273-4d30-bfef-0c835cfa028c",
          festivalType: "glitter",
          displayName: "Glitter",
          badge: "Festival creativo",
          description:
            "El encuentro donde el arte, la ilustración y los oficios creativos cobran vida.",
          fallbackImage: {
            url: "/img/landing-festivals/glitter-characters.png",
            alt: "Personajes animales que forman parte del universo de Glitter",
            focalPoint: { x: 50, y: 50 },
          },
          href: null,
          showCta: true,
        },
        {
          id: "e20f3377-0cd0-4f1f-b3f8-0e6af074b55a",
          festivalType: "festicker",
          displayName: "Festicker",
          badge: "Festival urbano",
          description:
            "Stickers, personajes y cultura urbana en una celebración que toma la ciudad.",
          fallbackImage: {
            url: "/img/landing-festivals/festicker-characters.png",
            alt: "Los cuatro personajes del universo urbano de Festicker",
            focalPoint: { x: 50, y: 50 },
          },
          href: "/festivals/festicker",
          showCta: true,
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
          showCta: true,
        },
      ],
    },
    community: {
      enabled: true,
      heading: "Momentos y voces de Glitter",
      body: "Una galería de nuestros festivales y comentarios de quienes forman parte.",
      testimonialHeading: "Comentarios de participantes",
      gallery: DEFAULT_COMMUNITY_GALLERY,
      testimonials: [
        {
          id: "f5b5353e-9f49-4a21-a572-c232dde275f2",
          quote:
            "Glitter cambió por completo mi forma de conectar con otros artistas. La calidez de la gente de Santa Cruz es inigualable.",
          name: "Cata Ilustra",
          role: "Ilustradora",
          image: {
            url: asset("testimonial-cata.png"),
            alt: "Retrato de Cata Ilustra",
          },
        },
        {
          id: "4c6bc7b7-d6a1-4571-a9b3-c9415c575d1d",
          quote:
            "Vender mis cerámicas artesanales en Glitter me permitió llegar a coleccionistas que valoran el trabajo hecho con paciencia y amor.",
          name: "Bruno Cerámicas",
          role: "Ceramista",
          image: {
            url: asset("testimonial-bruno.png"),
            alt: "Retrato de Bruno Cerámicas",
          },
        },
        {
          id: "1e74a1d0-0329-4dd8-9b03-f5d17d498a6d",
          quote:
            "El ambiente cute and clean se siente en cada rincón. Es el festival más lindo de Bolivia sin duda alguna.",
          name: "Menta y Lana",
          role: "Arte textil",
          image: {
            url: asset("testimonial-menta.png"),
            alt: "Retrato de Menta y Lana",
          },
        },
      ],
    },
    partners: {
      enabled: true,
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
      "Ecosistema cultural y creativo independiente de Santa Cruz, Bolivia. Produciendo momentos mágicos e inspiradores desde el corazón de Sudamérica.",
    festivalLinks: [
      { label: "Glitter", href: "#festivales" },
      { label: "Twinkler", href: "#festivales" },
      { label: "Festicker", href: "/festivals/festicker" },
    ],
    communityLinks: [
      { label: "Artistas", href: "#comunidad" },
      { label: "Staff voluntario", href: "/sign_up" },
      { label: "Postulaciones", href: "/sign_up" },
    ],
    contactEmail: "info@productoraglitter.com",
    location: "Santa Cruz, Bolivia",
    copyrightText:
      "Productora Glitter. Todos los derechos reservados. Diseñado con amor en Santa Cruz, Bolivia.",
    socialLinks: [
      {
        id: "c4e1e10f-1b74-40f7-aae4-7fa3e8ac1baf",
        network: "instagram",
        label: "Instagram",
        href: "https://www.instagram.com/glitter.bo",
      },
      {
        id: "9df41d59-032e-49fe-91a7-c4bcae64c1e9",
        network: "tiktok",
        label: "TikTok",
        href: "https://www.tiktok.com/@glitter.bo",
      },
      {
        id: "13d4452e-b85b-47d5-b6bc-60270d808413",
        network: "facebook",
        label: "Facebook",
        href: "https://www.facebook.com/glitterfestival",
      },
    ],
  },
};
