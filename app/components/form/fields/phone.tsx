"use client";

import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
	useFormField,
} from "@/app/components/ui/form";
import { PhoneInput as ReactInternationalPhoneInput } from "react-international-phone";
import { UseFormReturn } from "react-hook-form";
import { cn } from "@/lib/utils";
import "react-international-phone/style.css";
import "./styles.css";

export default function PhoneInput({
	bottomBorderOnly,
	label,
	name,
}: {
	bottomBorderOnly?: boolean;
	/** @deprecated FormField gets the control form the context */
	formControl?: UseFormReturn<any>["control"];
	label?: string;
	name: string;
}) {
	return (
		<FormField
			name={name}
			render={({ field }) => (
				<FormItem className="grid gap-2">
					{label && <FormLabel>{label}</FormLabel>}
					<FormControl>
						<ReactInternationalPhoneInput
							className={cn(
								"phone-input",
								bottomBorderOnly && "phone-input--bottom-border-only",
							)}
							forceDialCode
							preferredCountries={["ar", "bo", "br", "co", "pe", "us"]}
							defaultCountry="bo"
							{...field}
						/>
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}
