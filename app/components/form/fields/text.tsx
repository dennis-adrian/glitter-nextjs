import { InputHTMLAttributes } from "react";

import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";

export default function TextInput({
	bottomBorderOnly,
	label,
	name,
	messagePosition = "bottom",
	description,
	required,
	...props
}: {
	bottomBorderOnly?: boolean;
	label?: string;
	messagePosition?: "top" | "bottom";
	name: string;
	placeholder?: string;
	description?: string;
	required?: boolean;
} & InputHTMLAttributes<HTMLInputElement>) {
	return (
		<FormField
			name={name}
			render={({ field }) => (
				<FormItem className="w-full grid gap-2">
					{label && (
						<FormLabel>
							{label}
							{required && <span className="text-destructive ml-0.5">*</span>}
						</FormLabel>
					)}
					{messagePosition === "top" && <FormMessage />}
					<FormControl>
						<Input bottomBorderOnly={bottomBorderOnly} {...field} {...props} />
					</FormControl>
					{description && <FormDescription>{description}</FormDescription>}
					{messagePosition === "bottom" && <FormMessage />}
				</FormItem>
			)}
		/>
	);
}
