import Image from "next/image";
import { MapPin, PartyPopperIcon, RocketIcon } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col container p-4 md:p-6">
      {/* Hero Section */}
      <section className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 to-black/30 z-10 rounded-lg" />
        <Image
          src="/img/festicker-banner.png"
          alt="Festival crowd"
          width={1200}
          height={538}
          className="w-full h-[70vh] object-cover rounded-lg"
          priority
        />
        <div className="container absolute inset-0 z-10 flex flex-col items-center justify-center text-center text-white">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
            Festicker
          </h1>
          <p className="mt-4 max-w-3xl text-xl text-white/90">
            Pegate a la onda de los stickers
          </p>
          {/* <div className="mt-8 flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4">
            <Button size="lg" className="bg-festicker hover:bg-festicker/90">
              Join Our Newsletter
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-white border-white hover:bg-white/10"
            >
              Learn More
            </Button>
          </div> */}
        </div>
      </section>

      {/* About Section */}
      <section className="py-16 bg-background">
        <div className="container">
          <div className="flex flex-col items-center text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              Sobre el Festival
            </h2>
            <div className="w-20 h-1 bg-festicker my-6"></div>
            <p className="max-w-3xl text-muted-foreground text-lg">
              Festicker es un festival de dos días creado para ilustradores. El
              festival busca impulsar el coleccionismo de stickers y el apoyo al
              arte local.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
            <div className="flex flex-col items-center text-center p-6 rounded-lg border bg-card">
              <RocketIcon className="h-12 w-12 text-festicker mb-4" />
              <h3 className="text-xl font-bold mb-2 text-festicker">
                Múltiples espacios
              </h3>
              <p className="text-muted-foreground">
                El festival cuenta con 4 espacios distintos y cerca de 100
                ilustradores con estilos variados.
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-6 rounded-lg border bg-card">
              <PartyPopperIcon className="h-12 w-12 text-festicker mb-4" />
              <h3 className="text-xl font-bold mb-2 text-festicker">
                Experiencia única
              </h3>
              <p className="text-muted-foreground">
                Descubre el escaparate más grande para artistas de la ciudad y
                encuentra a esos artistas que no dejarás de seguir
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-6 rounded-lg border bg-card">
              <MapPin className="h-12 w-12 text-festicker mb-4" />
              <h3 className="text-xl font-bold mb-2 text-festicker">
                Ubicación inmejorable
              </h3>
              <p className="text-muted-foreground">
                Nos encontrarás en las instalaciones del CBA, a solo 3 cuadras
                de la plaza principal 24 de septiembre
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-festicker/10 rounded-lg">
        <div className="container">
          <div className="flex flex-col items-center text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              Qué encontrarás
            </h2>
            <div className="w-20 h-1 bg-festicker my-6"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <Image
              src="/img/festicker-magnifier-mascot.png"
              alt="Festival activities"
              width={328}
              height={400}
              className="mx-auto"
            />
            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-bold mb-2">
                  Un mundo de stickers
                </h3>
                <p className="text-muted-foreground">
                  Todos los ilustradores participantes tendrán al menos el 80%
                  de su “stand” lleno de diferentes diseños de stickers
                  personalizados de temáticas variadas.
                </p>
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-2">
                  Zona de “trading” de stickers
                </h3>
                <p className="text-muted-foreground">
                  Puedes quedar con tus amigos o conocer nuevas personas e
                  intercambiar stickers en un espacio cómodo y seguro.
                </p>
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-2">
                  Gastronomía creativa
                </h3>
                <p className="text-muted-foreground">
                  El festival cuenta con un sector gastronómico donde podrás
                  disfrutar con amigos
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Festival Map Section */}
      <section className="py-16 bg-background">
        <div className="container">
          <div className="flex flex-col items-center text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              Mapa del Festival
            </h2>
            <div className="w-20 h-1 bg-festicker my-6"></div>
            <p className="max-w-3xl text-muted-foreground text-lg">
              Familiarízate con la disposición del festival para que puedas
              moverte con facilidad entre los espacios y disfrutar de la
              experiencia al máximo. El ingreso será por la calle Sucre y la
              salida será por la calle Ballivián.
            </p>
          </div>

          <div className="">
            <div className="lg:col-span-2">
              <Image
                src="/img/festicker-general-map-1400x882.png"
                alt="Festival Map"
                width={1400}
                height={882}
              />
            </div>

            {/* <div className="space-y-6">
              <div className="bg-festicker/10 p-6 rounded-lg border border-festicker/20">
                <h3 className="text-xl font-bold mb-3">Navigation Tips</h3>
                <p className="text-muted-foreground mb-3">
                  Download the festival app for real-time updates and an
                  interactive map. Look for color-coded paths and numbered
                  markers throughout the grounds to help with orientation.
                </p>
                <p className="text-muted-foreground">
                  Information booths are staffed with knowledgeable volunteers
                  who can help you find your way.
                </p>
              </div>
            </div> */}
          </div>
        </div>
      </section>

      {/* FAQs Section */}
      <section className="py-16 bg-festicker/10 rounded-lg">
        <div className="container">
          <div className="flex flex-col items-center text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              Preguntas Frecuentes
            </h2>
            <div className="w-20 h-1 bg-festicker my-6"></div>
            <p className="max-w-3xl text-muted-foreground text-lg">
              Encuentra respuestas a preguntas frecuentes sobre el festival.
            </p>
          </div>

          <div className="max-w-3xl mx-auto mt-8">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem className="border-festicker/20" value="item-1">
                <AccordionTrigger
                  className="text-left"
                  iconClassName="text-festicker"
                >
                  ¿Quiénes pueden participar?
                </AccordionTrigger>
                <AccordionContent>
                  Ilustradores, artistas o diseñadores gráficos que cuenten con
                  ilustraciones propias o fan-arts. Que ya cuenten con un perfil
                  aprobado en el sitio web oficial de la Productora Glitter.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem className="border-festicker/20" value="item-2">
                <AccordionTrigger
                  className="text-left"
                  iconClassName="text-festicker"
                >
                  ¿Cómo puedo participar?
                </AccordionTrigger>
                <AccordionContent>(describir pasos)</AccordionContent>
              </AccordionItem>
              <AccordionItem className="border-festicker/20" value="item-3">
                <AccordionTrigger
                  className="text-left"
                  iconClassName="text-festicker"
                >
                  ¿Se puede comercializar stickers con diseños generados con
                  inteligencia artificial o imágenes calcadas o sacadas de
                  internet?
                </AccordionTrigger>
                <AccordionContent>
                  No. El objetivo del festival es impulsar y apoyar el arte
                  local por tanto está prohibido comercializar mercancía con
                  imágenes generadas con inteligencia artificial o imágenes
                  sacadas de internet
                </AccordionContent>
              </AccordionItem>
              <AccordionItem className="border-festicker/20" value="item-4">
                <AccordionTrigger
                  className="text-left"
                  iconClassName="text-festicker"
                >
                  ¿Qué es un fan-art? ¿Están permitidos?
                </AccordionTrigger>
                <AccordionContent>
                  Un fan-art es una ilustración basada en personajes de
                  películas, libros, cómics o series que los artistas realizan
                  desde cero con su propio estilo de ilustración. Los fan-arts
                  están permitidos.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem className="border-festicker/20" value="item-5">
                <AccordionTrigger
                  className="text-left"
                  iconClassName="text-festicker"
                >
                  ¿Está prohibida la venta de otros productos que no sean
                  stickers?
                </AccordionTrigger>
                <AccordionContent>
                  No, aquí hay una lista de productos que sí se pueden vender
                  aparte de los stickers siempre y cuando no representen mas de
                  20% del espacio del stand:
                  <ol>
                    <li>Llaveros plastificados o de acrílicos</li>
                    <li>Pines metálicos o tipo botón</li>
                    <li>Poleras o totebags</li>
                    <li>Imanes</li>
                    <li>Prints o posters</li>
                    <li>Tazas y lanyards</li>
                    <li>Fanzines o cómics propios</li>
                  </ol>
                  <p>
                    Estos productos pueden venderse siempre y cuando las
                    ilustraciones sean propias y no ocupen mas del 20% del
                    espacio del stand, ya que el 80% del stand deben de ser
                    stickers.
                  </p>
                  <p>
                    Como sugerencia para que los pines y llaveros no ocupen
                    espacio, pueden realizarse muestrarios y colgarlos en sus
                    rejillas. De esta manera el público los verá y los pedirá.
                    Mas no estarán sobre la mesa ocupando espacio.
                  </p>
                  <p>Ejemplo: -imagen-</p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem className="border-festicker/20" value="item-6">
                <AccordionTrigger
                  className="text-left"
                  iconClassName="text-festicker"
                >
                  ¿Puedo compartir mi stand con otro ilustrador?
                </AccordionTrigger>
                <AccordionContent>
                  Compartir stand con otro ilustrador está permitido pero no es
                  obligatorio. El ilustrador con el que comparten stand primero
                  debe de tener un perfil aprobado en el sitio web. También
                  deben de colocar su nombre al momento de hacer la reserva. No
                  está permitido que compartan stand con un ilustrador que no
                  tenga un perfil aprobado en el sitio web.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>
    </div>
  );
}
