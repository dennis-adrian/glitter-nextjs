import Link from "next/link";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { socialsUrls } from "@/app/lib/config";
import GlitterLogo from "@/app/components/landing/glitter-logo";
import {
  faFacebook,
  faInstagram,
  faTiktok,
} from "@fortawesome/free-brands-svg-icons";

export default function Footer() {
  return (
    <footer className="bg-gradient-to-br from-violet-500 to-primary-600 text-primary-foreground text-sm md:text-base">
      <div className="container m-auto py-5 px-4 md:px-6">
        <div className="grid gap-4 sm:gap-8 md:grid-cols-3">
          <div className="col-span-2">
            <GlitterLogo />
            <p className="ml-1">Un festival para que los artistas brillen</p>
          </div>
          <div>
            <p className="font-semibold text-base md:text-lg">
              Conéctate a nuestras redes
            </p>
            <div className="flex flex-col gap-1">
              <Link
                className="flex items-center hover:underline"
                href={`${socialsUrls["instagram"]}glitter.bo`}
                target="_blank"
              >
                <FontAwesomeIcon className="w-4 h-4 mr-1" icon={faInstagram} />{" "}
                Instagram
              </Link>
              <Link
                className="flex items-center hover:underline"
                href={`${socialsUrls["facebook"]}glitterfestival`}
                target="_blank"
              >
                <FontAwesomeIcon className="w-4 h-4 mr-1" icon={faFacebook} />
                Facebook
              </Link>
              <Link
                className="flex items-center hover:underline"
                href={`${socialsUrls["tiktok"]}festival.glitter.bo`}
                target="_blank"
              >
                <FontAwesomeIcon className="w-4 h-4 mr-1" icon={faTiktok} />
                TikTok
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
