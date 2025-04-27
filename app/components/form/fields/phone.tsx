import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { PhoneInput as ReactInternationalPhoneInput } from "react-international-phone";
import { UseFormReturn } from "react-hook-form";
import "react-international-phone/style.css";
import "./styles.css";

export default function PhoneInput({
  bottomBorderOnly,
  formControl,
  label,
  name,
}: {
  bottomBorderOnly?: boolean;
  formControl: UseFormReturn<any>["control"];
  label?: string;
  name: string;
}) {
  return (
		<FormField
			control={formControl}
			name={name}
			render={({ field }) => (
				<FormItem className="grid gap-2">
					{label && <FormLabel>{label}</FormLabel>}
					<FormControl>
						<ReactInternationalPhoneInput
							forceDialCode
							preferredCountries={["ar", "bo", "br", "co", "pe", "us"]}
							inputStyle={{
								border: "none",
								borderBottom: "1px solid hsl(var(--primary-500))",
								borderRadius: "0",
								width: "100%",
								fontSize: "hsl(var(--font-size-base))",
							}}
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
