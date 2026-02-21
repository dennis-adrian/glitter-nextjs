import React, { JSX } from "react";

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

interface HeadingProps {
	level?: HeadingLevel;
	children: React.ReactNode;
	className?: string;
}

const headingStyles: Record<HeadingLevel, string> = {
	1: "text-3xl md:text-4xl lg:text-5xl font-bold",
	2: "text-2xl md:text-3xl lg:text-4xl font-bold",
	3: "text-xl md:text-2xl lg:text-3xl font-bold",
	4: "text-lg md:text-xl lg:text-2xl font-semibold",
	5: "text-base md:text-lg lg:text-xl font-semibold",
	6: "text-base md:text-lg font-semibold",
};

export default function Heading({
	level = 1,
	children,
	className = "",
}: HeadingProps) {
	const Tag = `h${level}` as keyof JSX.IntrinsicElements;
	const baseStyles = headingStyles[level];

	return React.createElement(
		Tag,
		{
			className: `${baseStyles} text-foreground ${className}`,
			style: { fontFamily: "var(--font-space-grotesk)" },
		},
		children,
	);
}
