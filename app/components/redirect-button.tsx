"use client";

import Link from "next/link";

import { cn } from "@/app/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { VariantProps } from "class-variance-authority";
import { HTMLAttributes, useCallback, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import clsx from "clsx";
import { useRouter } from "next/navigation";

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
	const [isPending, startTransition] = useTransition();
	const router = useRouter();

	if (disabled) {
		return (
			<Button disabled variant={variant} {...props}>
				{children}
			</Button>
		);
	}

	const handleClick = useCallback(() => {
		startTransition(() => {
			router.push(href);
		});
	}, [href, router]);

	return isPending ? (
		<Button disabled variant={variant} {...props}>
			<Loader2Icon
				className={clsx("h-4 w-4 animate-spin", loadingText && "mr-1")}
			/>
			{loadingText && loadingText}
		</Button>
	) : (
		<Button variant={variant} onClick={handleClick} {...props}>
			{children}
		</Button>
	);
}
