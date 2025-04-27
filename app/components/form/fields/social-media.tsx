"use client";

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import {
  faInstagram,
  faTiktok,
  IconDefinition,
} from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { InputHTMLAttributes } from "react";
import { UseFormReturn } from "react-hook-form";

export default function SocialMediaInput({
	bottomBorderOnly,
	icon,
	formControl,
	label,
	name,
	...props
}: {
	bottomBorderOnly?: boolean;
	icon?: React.ComponentType<{ className?: string }>;
	formControl: UseFormReturn<any>["control"];
	label: string;
	name: string;
	placeholder?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
	const Icon = icon;

	return (
		<FormField
			control={formControl}
			name={name}
			render={({ field }) => {
				return (
					<FormItem className="grid gap-2 w-full">
						<FormLabel>{label}</FormLabel>
						<FormControl>
							<div className="flex items-end gap-2">
								{Icon && (
									<div className="flex items-center justify-center h-full pt-1">
										<Icon className="w-4 h-4" />
									</div>
								)}
								<div className="relative flex items-center w-full">
									<span className="absolute text-muted-foreground">@</span>
									<Input
										bottomBorderOnly
										className="pl-5"
										{...field}
										{...props}
										// this is necessary so the input doesn't go from null to "" which triggers a validation error
										value={field.value || ""}
									/>
								</div>
							</div>
						</FormControl>
						<FormMessage />
					</FormItem>
				);
			}}
		/>
	);
}
