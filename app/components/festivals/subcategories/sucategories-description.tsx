import CategoryCard from "@/app/components/festivals/subcategories/category-card";
import { cn } from "@/app/lib/utils";
import Link from "next/link";
import { ComponentProps } from "react";

type SubcategoriesDescriptionProps = ComponentProps<"div">;
export default function SubcategoriesDescription(
  props: SubcategoriesDescriptionProps,
) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4",
        props.className,
      )}
      {...props}
    >
      <CategoryCard title="Ilustración">
        <p>
          ¿Realizas Ilustración digital o tradicional? ¿Tenes productos como
          pines, stickers, llaveros con ilustraciones propias? ¡Ésta es tu
          categoría!
        </p>
        <p>
          Los ilustradores forman el 60% de los espacios en el festival
          mostrando ilustraciones originales que ellos mismos han realizado.
        </p>
      </CategoryCard>
      <CategoryCard title="Crochet">
        <p>
          ¿Realizas peluches (amigurumis), flores, prendas y decoraciones
          tejidas a ganchillo o gancho? Sí es así, ¡el crochet es lo tuyo!
        </p>
        <p>
          La categoría crochet se ha abierto gracias a la alta demanda de
          artistas de crochet que han participado del festival.
        </p>
      </CategoryCard>
      <CategoryCard title="Bisutería / Bijouteria">
        <p>
          El arte de la bisutería / bijouteria consiste en el armado de
          manillas, collares, aretes, etc., a partir de la mano creativa de su
          creador que elige cuidadosamente las perlas, dijes y demás accesorios
          variados similares a la joyería.
        </p>
        <p>
          En nuestros festivales se ha abierto la categoría Bisutería/Bijouteria
          para aquellos emprendimientos que deseen mostrar y vender estos
          accesorios.
        </p>
      </CategoryCard>
      <CategoryCard title="Arte en vidrio">
        <p>
          ¿Haces collage con vidrios? ¿Pintas sobre vidrio? ¿O quizás armas
          piezas decorativas en vidrio? Si tu arte involucra el vidrio como su
          atractivo principal, ¡esta es tu categoría!
        </p>
        <p>
          El arte sobre el cristal empezó a gozar de mayor popularidad en los
          últimos años por su versatilidad y su belleza en el material, que
          resalta la pintura y la composición de cualquier pieza.
        </p>
        <p>
          El festival abre la categoría para aquellos artistas que realicen su
          arte en este material.
        </p>
      </CategoryCard>
      <CategoryCard title="Arte en papel / Papercraft">
        <p>
          ¿Tenes habilidad para las manualidades en distintos tipos de papel? El
          arte en este material que para muchos quizás sea algo muy común, puede
          hacer volar nuestra imaginación; desde origami, escultura en papel,
          collages, recortes, modelos 3D hechos a mano, hasta rosas eternas
          ¡todo en esta categoría!
        </p>
      </CategoryCard>
      <CategoryCard title="Arte en madera">
        <p>
          Lo atemporal, lo natural y la destreza del artista se unen en las
          piezas únicas de la madera. Dentro de este arte se puede hallar la
          pintura en madera, escultura con madera, escritura sobre madera,
          tallado en madera, y muchos más.
        </p>
        <p>
          Si tus creaciones involucran este maravilloso material, ¡esta es tu
          categoría!
        </p>
      </CategoryCard>
      <CategoryCard title="Arte en arcilla">
        <p>
          Desde tazas, platos, ceniceros, hasta esculturas de animalitos, ¡la
          arcilla es un material que permite la creación de un montón de
          maravillas!
        </p>
        <p>
          Si eres un artista que realiza sus obras en arcilla, ¡el festival creó
          esta categoría para vos!
        </p>
      </CategoryCard>
      <CategoryCard title="Porcelana fría">
        <p>
          Para los amantes de las manualidades, ¡la porcelana fría es el
          material perfecto para realizar modelados únicos y divertidos!
        </p>
        <p>
          El festival recibe artistas que ofrecen todo tipo de producto
          realizado a mano con este material.
        </p>
        <p>
          Si tus piezas son creadas a partir de porcelana fría, ¡tu categoría
          está aquí!
        </p>
      </CategoryCard>
      <CategoryCard title="Diseño y confección">
        <p>
          ¡Moda, costura y mucho estilo! El arte del diseño y la confección se
          trata de la creación de prendas únicas y muy <i>chicks</i>.
        </p>
        <p>
          Si eres diseñador/a de moda y cuentas con tu propia línea de ropa, ya
          sea poleras, jeans, vestidos, faldas, zapatos, carteras, etc.,
          entonces llegaste al lugar correcto.
        </p>
      </CategoryCard>
      <CategoryCard title="Encuadernación">
        <p>
          ¿Realizas tus propios cuadernos, libretas, diarios y otros de manera
          artesanal?
        </p>
        <p>
          La encuadernación consiste en la unión de pliegues de papel unidos y
          sujetos por ambos lados de una tapa resistente, con el fin de mantener
          en orden y a salvo las páginas. Y además, ¡puedes dotarlas de diseños
          únicos!
        </p>
        <p>
          Además, si te dedicas a la personalización de diarios o álbumes a
          partir de recortes varios, manualidades o cualquier tipo de elemento,
          ¡también te tomamos en cuenta!
        </p>
        <p>¿La encuadernación es lo tuyo? ¡Estás en el lugar correcto!</p>
      </CategoryCard>
      <CategoryCard title="Bordado">
        <p>
          El fino arte que requiere dedicación y paciencia. Consiste en aplicar
          mediante hilos de diversos colores y aguja una decoración en una tela
          lisa, también denominada fondo.
        </p>
        <p>
          El bordado es magnífico por los patrones y diseños que puede formar
          sobre la tela. ¡Es como dibujar pero con hilo y aguja!
        </p>
        <p>Si el bordado es lo tuyo, ¡esta es tu categoría!</p>
      </CategoryCard>
      <CategoryCard title="Pintura">
        <p>
          Óleo, acuarela, gouache, témpera, acrílico, pastel o tinta, la pintura
          es un arte tan amplio y que requiere de tantos conocimientos que su
          práctica se conserva a pesar de su longevidad.
        </p>
        <p>
          Sea cual sea tu técnica, estilo o inspiración, ¡prepara tus lienzos!
          ¡Esta es tu categoría!
        </p>
      </CategoryCard>
      <CategoryCard title="Libros y cómics">
        <p>
          El mundo del arte no se olvida del amplio mundo de las letras, la
          ficción, la prosa y la narrativa. En Glitter nos encanta sumirnos en
          la fantasía de las historias que los autores nacionales tienen para
          nosotros.
        </p>
        <p>
          Si eres un autor boliviano independiente, o cuentas con colecciones de
          libros, cómics y/o mangas variados, tanto nacionales como
          internacionales, ¡tu categoría está aquí!
        </p>
      </CategoryCard>
      <CategoryCard title="Coleccionables">
        <p>
          Está categoría es para aquellos que venden productos coleccionables.
          Figuras, vinilos, cómics, muñecas o artículos.
        </p>
      </CategoryCard>
      <CategoryCard title="Skincare">
        <p>
          La categoría skincare fue creada para que emprendimientos de belleza
          que están empezando, puedan darse a conocerse. Esta categoría no
          permite que puedan comercializar ningún producto que no esté
          relacionado con el skincare. Por ejemplo: Stickers, tazas, poleras,
          pines, llaveros, papelería.
        </p>
      </CategoryCard>
      <CategoryCard title="Gastronomía">
        <p>¿Quiénes pueden ser parte de la categoría Gastronomía?</p>
        <p>
          Esta categoría permite únicamente emprendimientos con productos ya
          elaborados, empaquetados o listos para servir. El festival no cuenta
          con la disponibilidad de aceptar cocinas, carritos con garrafas ni
          equipo que pueda provocar fuego. Tampoco están permitidos los
          alimentos que generen olores fuertes por ejemplo: ramen de queso ni
          bebidas o postres con alcohol.
        </p>
        <p>
          En esta categoría nos han acompañado emprendimientos de: Brownies,
          galletas, sandwiches, masitas, tortas, bubble teas y cafeterías.
        </p>
      </CategoryCard>
      <CategoryCard title="Sublimación colaborativa">
        <p>
          Nos interesan mucho los ilustradores y artistas que vienen al
          festival, por ello, si tienes un emprendiendo de sublimación en
          poleras, llaveros, tazas, gorras, etc., y gustas ser parte de Glitter,
          puedes hacerlo únicamente si los diseños de los productos que ofreces
          son colaborativos o pagados a un ilustrador.{" "}
        </p>
        <p>
          El festival no permite la venta de productos con imágenes sacadas de
          internet. Si quieres ser parte de esta categoría, comunícate con el
          equipo Glitter al correo{" "}
          <Link
            className="text-blue-500"
            href="mailto:equipo@productoraglitter.com"
          >
            equipo@productoraglitter.com
          </Link>
        </p>
      </CategoryCard>
    </div>
  );
}
