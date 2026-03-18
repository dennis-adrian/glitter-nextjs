import {
	FormField,
	FormItem,
	FormControl,
	FormLabel,
	FormDescription,
	FormMessage,
} from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Path, FieldValues, useFormContext } from "react-hook-form";

type ConsentFormFieldProps = {
	name: Path<FieldValues>;
	label: string;
	description: string;
};

export default function ConsentFormField({
	name,
	label,
	description,
}: ConsentFormFieldProps) {
	const form = useFormContext();

	return (
		<FormField
			control={form.control}
			name={name}
			render={({ field, fieldState }) => (
				<FormItem className="flex flex-col gap-2">
					<div className="flex flex-col gap-1 p-4 bg-primary-50/20 border border-primary-100 rounded-md text-primary-500">
						<div className="flex flex-row items-center gap-1">
							<FormControl>
								<Checkbox
									checked={field.value}
									onCheckedChange={field.onChange}
								/>
							</FormControl>
							<FormLabel className="text-current">{label}</FormLabel>
						</div>
						<FormDescription className="ml-5 text-muted-foreground">
							{description}
						</FormDescription>
					</div>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}
