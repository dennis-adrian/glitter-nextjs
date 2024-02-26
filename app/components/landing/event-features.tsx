import Image from "next/image";

function Figure({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption: string;
}) {
  return (
    <div className="bg-gradient-to-b from-blue-200 to-white border border-blue-50 p-4 rounded-lg transition duration-300 ease-in-out hover:from-blue-300 hover:to-rose-100 hover:scale-105 hover:border-none">
      <figure>
        <Image
          className="m-auto"
          src={src}
          alt={alt}
          width={240}
          height={240}
        />
        <figcaption className="font-semibold">{caption}</figcaption>
      </figure>
    </div>
  );
}

export default function EventFeatures() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 pt-8 max-w-screen-lg m-auto">
      <Figure
        src="/img/landing/samy-illustration.png"
        alt="Samy ilustrador"
        caption="Ilustración"
      />
      <Figure
        src="/img/landing/samy-pin.png"
        alt="Samy con un pin"
        caption="Pines"
      />
      <Figure
        src="/img/landing/samy-comic.png"
        alt="Samy con un comic"
        caption="Cómics"
      />
      <Figure
        src="/img/landing/samy-stickers.png"
        alt="Samy con stickers"
        caption="Stickers"
      />
    </div>
  );
}
