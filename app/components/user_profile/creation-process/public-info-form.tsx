import TextInput from "@/app/components/form/fields/text";
import { Form } from "@/app/components/ui/form";
import { useForm } from "react-hook-form";

export default function PublicInfoForm() {
	const form = useForm();

	return (
		<Form {...form}>
			<form>
				<TextInput
					label="Nombre"
					name="firstName"
					placeholder="Ingresa tu nombre"
				/>
				<TextInput
					label="Apellido"
					name="lastName"
					placeholder="Ingresa tu apellido"
				/>
				<TextInput
					label="Correo electrónico"
					name="email"
					placeholder="Ingresa tu correo electrónico"
				/>
			</form>
		</Form>
	);
}
