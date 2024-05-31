import Image from "next/image";

type GlitterLogoProps = {
  variant?: "light" | "dark";
  size?: "sm" | "md";
};

export default function GlitterLogo(props: GlitterLogoProps) {
  if (props.size === "md") {
    return (
      <Image
        className="w-auto"
        src={
          props.variant === "dark"
            ? "/img/logo/logo-full-dark-md.png"
            : "/img/logo/logo-full-white.png"
        }
        alt="Logo"
        width={160}
        height={32}
      />
    );
  }

  return (
    <Image
      className="w-auto"
      src={
        props.variant === "dark"
          ? "/img/logo/logo-full-dark-sm.png"
          : "/img/logo/logo-full-white-sm.png"
      }
      alt="Logo"
      width={100}
      height={20}
    />
  );
}
