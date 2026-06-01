"use client";

import { useEffect, useRef } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

type Props = {
	register: UseFormRegisterReturn;
	value: string;
	disabled?: boolean;
};

function autosize(el: HTMLTextAreaElement | null) {
	if (!el) return;
	el.style.height = "auto";
	el.style.height = `${el.scrollHeight}px`;
}

export default function TitleTextarea({ register, value, disabled }: Props) {
	const ref = useRef<HTMLTextAreaElement | null>(null);
	const { ref: rhfRef, ...rest } = register;

	useEffect(() => {
		autosize(ref.current);
	}, [value]);

	return (
		<textarea
			rows={1}
			placeholder="Título del artículo"
			disabled={disabled}
			{...rest}
			ref={(el) => {
				rhfRef(el);
				ref.current = el;
			}}
			onInput={(e) => autosize(e.currentTarget)}
			className="w-full resize-none overflow-hidden border-0 bg-transparent px-3 text-2xl font-bold leading-tight outline-none placeholder:text-muted-foreground/30 md:px-[54px] md:text-4xl"
		/>
	);
}
