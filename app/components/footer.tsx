"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/app/lib/utils";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import GlitterLogo from "@/app/components/landing/glitter-logo";
import {
  faFacebook,
  faInstagram,
  faTiktok,
} from "@fortawesome/free-brands-svg-icons";

export default function Footer() {
  const pathname = usePathname();

  return (
    <footer
      className={cn(
        "bg-gradient-to-br from-primary to-secondary-400 text-primary-foreground text-sm md:text-base",
        {
          hidden:
            pathname.includes("festivals") && pathname.includes("registration"),
        },
      )}
    >
      <div className="container m-auto py-5 px-4 md:px-6 ">
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
                href="https://instagram.com/glitter.bo"
                target="_blank"
              >
                <FontAwesomeIcon className="w-4 h-4 mr-1" icon={faInstagram} />{" "}
                Instagram
              </Link>
              <Link
                className="flex items-center hover:underline"
                href="https://facebook.com/glitterfestival"
                target="_blank"
              >
                <FontAwesomeIcon className="w-4 h-4 mr-1" icon={faFacebook} />
                Facebook
              </Link>
              <Link
                className="flex items-center hover:underline"
                href="https://tiktok.com/@festival.glitter.bo"
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
