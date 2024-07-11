import Image from "next/image";

type GlitterLogoProps = {
  className?: string;
  height: number;
  width: number;
  variant?: "light" | "dark";
  size?: "sm" | "md";
};

export default function GlitterLogo(props: GlitterLogoProps) {
  return (
    <Image
      className={props.className}
      src={
        props.variant === "dark"
          ? "/img/logo/glitter-logo-dark-160x160.png"
          : "/img/logo/glitter-logo-light-160x160.png"
      }
      alt="Logo"
      height={props.height}
      width={props.width}
    />
  );
}
