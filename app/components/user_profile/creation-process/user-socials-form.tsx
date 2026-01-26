import { ProfileType } from "@/app/api/users/definitions";
import SocialMediaInput from "@/app/components/form/fields/social-media";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { formatUserSocialsForInsertion } from "@/app/components/user_profile/public_profile/utils";
import FacebookIcon from "@/app/icons/FacebookIcon";
import InstagramIcon from "@/app/icons/InstagramIcon";
import TikTokIcon from "@/app/icons/TikTokIcon";
import { upsertUserSocialProfiles } from "@/app/lib/users/actions";
import { usernameRegex } from "@/app/lib/users/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownToLineIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z.object({
  instagram: z
    .string({
        error: (issue) => issue.input === undefined ? "El perfil de Instagram es requerido" : undefined
    })
    .trim()
    .min(2, {
        error: "El nombre de tu usuario de Instagram no puede estar vacío"
    })
    .regex(
      usernameRegex,
      "El nombre de usuario no puede tener caracteres especiales",
    ),
  tiktok: z
    .string()
    .trim()
    .refine((value) => value === "" || usernameRegex.test(value), {
        error: "El nombre de usuario no puede tener caracteres especiales"
    })
    .optional(),
  facebook: z
    .string()
    .trim()
    .refine((value) => value === "" || usernameRegex.test(value), {
        error: "El nombre de usuario no puede tener caracteres especiales"
    })
    .optional(),
});

type UserSocialsFormProps = {
  profile: ProfileType;
};

export default function UserSocialsForm(props: UserSocialsFormProps) {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const socials = formatUserSocialsForInsertion(data);
    const res = await upsertUserSocialProfiles(props.profile.id, socials);
    if (res.success) {
      toast.success(res.message);
    } else {
      toast.error(res.message);
    }
  });

  return (
		<Form {...form}>
			<form onSubmit={action} className="w-full">
				<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-4 items-start my-4">
					<SocialMediaInput
						bottomBorderOnly
						formControl={form.control}
						label="Perfil de Instagram*"
						name="instagram"
						icon={InstagramIcon}
					/>
					<SocialMediaInput
						bottomBorderOnly
						formControl={form.control}
						label="Perfil de TikTok"
						name="tiktok"
						icon={TikTokIcon}
					/>
					<SocialMediaInput
						bottomBorderOnly
						formControl={form.control}
						label="Perfil de Facebook"
						name="facebook"
						icon={FacebookIcon}
					/>
				</div>
				<div>
					<p className="text-xs md:text-sm italic text-muted-foreground">
						* El perfil de Instagram es requerido. Los perfiles de TikTok y
						Facebook son opcionales.
					</p>
				</div>
				<div className="flex gap-2 my-4 col-span-1 sm:col-span-2 md:col-span-3">
					<SubmitButton
						disabled={form.formState.isSubmitting}
						loading={form.formState.isSubmitting}
					>
						Guardar
						<ArrowDownToLineIcon className="ml-2 w-4 h-4" />
					</SubmitButton>
				</div>
			</form>
		</Form>
	);
}
