import { UserCategory } from "@/app/api/users/definitions";
import { FestivalMapVersion } from "@/app/data/festivals/definitions";
import { StandZone } from "@/app/api/stands/definitions";

export const imagesSrc: {
  [key in FestivalMapVersion]: {
    [key in Exclude<UserCategory, "none">]: {
      [key in StandZone]?: {
        sm: string;
        md: string;
      };
    } & {
      stand?: string;
      mascot?: string;
    };
  };
} = {
  v1: {
    illustration: {
      main: {
        sm: "/img/maps/v3/theater-map-sm.png",
        md: "/img/maps/v3/theater-map-md.png",
      },
    },
    gastronomy: {
      main: {
        sm: "/img/maps/v3/patio-map-sm.png",
        md: "/img/maps/v3/patio-map-md.png",
      },
    },
    entrepreneurship: {
      main: {
        sm: "/img/maps/v3/gallery-map-sm.png",
        md: "/img/maps/v3/gallery-map-md.png",
      },
    },
  },
  v2: {
    illustration: {
      main: {
        sm: "/img/maps/v3/theater-map-sm.png",
        md: "/img/maps/v3/theater-map-md.png",
      },
    },
    gastronomy: {
      main: {
        sm: "/img/maps/v3/patio-map-sm.png",
        md: "/img/maps/v3/patio-map-md.png",
      },
    },
    entrepreneurship: {
      main: {
        sm: "/img/maps/v3/gallery-map-sm.png",
        md: "/img/maps/v3/gallery-map-md.png",
      },
    },
  },
  v3: {
    illustration: {
      main: {
        sm: "/img/maps/v3/theater-map-sm.png",
        md: "/img/maps/v3/theater-map-md.png",
      },
      secondary: {
        sm: "/img/maps/v3/lobby-map-sm.png",
        md: "/img/maps/v3/lobby-map-md.png",
      },
      stand: "/img/maps/v3/illustration-stand-sm.png",
      mascot: "/img/maps/v3/illustration-mascot-sm.png",
    },
    gastronomy: {
      main: {
        sm: "/img/maps/v3/patio-map-sm.png",
        md: "/img/maps/v3/patio-map-md.png",
      },
      mascot: "/img/maps/v3/gastronomy-mascot-sm.png",
      stand: "/img/maps/v3/gastronomy-stand-sm.png",
    },
    entrepreneurship: {
      main: {
        sm: "/img/maps/v3/gallery-map-sm.png",
        md: "/img/maps/v3/gallery-map-md.png",
      },
      mascot: "/img/maps/v3/entrepreneurship-mascot-sm.png",
      stand: "/img/maps/v3/entrepreneurship-stand-sm.png",
    },
  },
};
