"use client";

import Link from "next/link";

import { cn } from "@/app/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { VariantProps } from "class-variance-authority";
import { HTMLAttributes, useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import clsx from "clsx";

export function RedirectButton({
	children,
	href,
	variant,
	disabled = false,
	loadingText = "Cargando",
	...props
}: {
	children: React.ReactNode;
	href: string;
	disabled?: boolean;
	loadingText?: string;
} & VariantProps<typeof buttonVariants> &
	HTMLAttributes<HTMLButtonElement>) {
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (loading) {
			const timeout = setTimeout(() => {
				setLoading(false);
			}, 5000);
			return () => clearTimeout(timeout);
		}
	}, [loading]);

	if (disabled) {
		return (
			<Button disabled variant={variant} {...props}>
				{children}
			</Button>
		);
	}

	return loading ? (
		<Button disabled variant={variant} {...props}>
			<Loader2Icon
				className={clsx("h-4 w-4 animate-spin", loadingText && "mr-1")}
			/>
			{loadingText && loadingText}
		</Button>
	) : (
		<Link className={cn("w-fit", props.className)} href={href}>
			<Button variant={variant} onClick={() => setLoading(true)} {...props}>
				{children}
			</Button>
		</Link>
	);
}
