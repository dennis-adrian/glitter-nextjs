import Image from "next/image";
import Link from "next/link";

import { londrinaSolid, junegull } from "@/ui/fonts";

import Button from "@/ui/button";
import bg_image from "../public/img/bg_w_1280.png";
import { currentUser } from "@clerk/nextjs";

export default async function Home() {
  const user = await currentUser();

  return (
    <div className="text-center">
      <section className="relative flex flex-col items-center justify-center p-8">
        <div className="-z-10">
          <Image
            alt="background image"
            src={bg_image}
            placeholder="blur"
            quality={100}
            fill
            style={{
              objectFit: "cover",
            }}
          />
        </div>
        <div className="m-auto mt-2 flex max-w-md flex-col justify-center">
          <h1
            className={`${junegull.className} text-5xl text-white sm:text-6xl`}
          >
            ¡Brillemos juntos!
          </h1>
        </div>
        <p
          className={`${londrinaSolid.className} m-auto max-w-xs py-4 text-xl leading-6 text-white sm:text-2xl`}
        >
          Festival para que los artistas brillen
        </p>
        <Image
          className="m-auto"
          src="/img/mascot.png"
          alt="Mascota Glitter"
          width={300}
          height={300}
        />
      </section>
      <section className="text-secondary-foreground m-auto max-w-screen-sm rounded-lg bg-amber-50 p-8 sm:mt-16">
        <h1 className={`${londrinaSolid.className} text-4xl`}>
          Próximo Evento
        </h1>
        <p className="py-4 text-xl leading-6">
          El 2 y 3 de marzo tendremos nuestra siguiente edición de Glitter
        </p>
        <Button>
          <Link href={`${user ? "/next_event" : "/sign_up"}`}>
            ¡Quiero participar!
          </Link>
        </Button>
      </section>
      <section className="m-auto max-w-screen-md bg-white p-8 sm:mt-8">
        <h1 className={`${londrinaSolid.className} text-4xl`}>
          ¿Quiénes somos?
        </h1>
        <p className="m-auto max-w-screen-sm py-4 text-center text-xl leading-6">
          <strong>Glitter</strong> es una productora de eventos artísticos
          dedicada a proporcionar un espacio seguro y acogedor para que
          ilustradores, artistas y autores de cómics puedan mostrar y vender su
          arte
        </p>
      </section>
    </div>
  );
}
