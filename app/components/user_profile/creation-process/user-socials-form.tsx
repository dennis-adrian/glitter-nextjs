import { ProfileType } from "@/app/api/users/definitions";
import SocialMediaInput from "@/app/components/form/fields/social-media";
import SubmitButton from "@/app/components/simple-submit-button";
import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import { usernameRegex } from "@/app/lib/users/utils";
import {
  faFacebookF,
  faInstagram,
  faTiktok,
  faYoutube,
} from "@fortawesome/free-brands-svg-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const FormSchema = z.object({
  instagramProfile: z
    .string({
      required_error: "El de Instagram es requerido",
    })
    .trim()
    .min(2, {
      message: "El nombre de tu perfil de Instagram no puede estar vacío",
    })
    .refine((value) => value === "" || usernameRegex.test(value), {
      message: "El nombre de usuario no puede tener caracteres especiales",
    }),
  tiktokProfile: z
    .string()
    .trim()
    .refine((value) => value === "" || usernameRegex.test(value), {
      message: "El nombre de usuario no puede tener caracteres especiales",
    })
    .optional(),
  facebookProfile: z
    .string()
    .trim()
    .refine((value) => value === "" || usernameRegex.test(value), {
      message: "El nombre de usuario no puede tener caracteres especiales",
    })
    .optional(),
  youtubeProfile: z
    .string()
    .trim()
    .refine((value) => value === "" || usernameRegex.test(value), {
      message: "El nombre de usuario no puede tener caracteres especiales",
    })
    .optional(),
});

type UserSocialsFormProps = {
  profile: ProfileType;
  onBack: () => void;
  onSubmit: () => void;
};

export default function UserSocialsForm(props: UserSocialsFormProps) {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      instagramProfile:
        props.profile.userSocials.find((social) => social.type === "instagram")
          ?.username || "",
      tiktokProfile:
        props.profile.userSocials.find((social) => social.type === "tiktok")
          ?.username || "",
      facebookProfile:
        props.profile.userSocials.find((social) => social.type === "facebook")
          ?.username || "",
      youtubeProfile:
        props.profile.userSocials.find((social) => social.type === "youtube")
          ?.username || "",
    },
  });

  const action: () => void = form.handleSubmit(async () => {
    console.log("submitting");
  });

  return (
    <Form {...form}>
      <form
        onSubmit={action}
        className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 items-start"
      >
        <SocialMediaInput
          bottomBorderOnly
          formControl={form.control}
          label="Perfil de Instagram"
          name="instagramProfile"
          icon={faInstagram}
        />
        <SocialMediaInput
          bottomBorderOnly
          formControl={form.control}
          label="Perfil de TikTok"
          name="tiktokProfile"
          icon={faTiktok}
        />
        <SocialMediaInput
          bottomBorderOnly
          formControl={form.control}
          label="Perfil de Facebook"
          name="facebookProfile"
          icon={faFacebookF}
        />
        <div className="flex gap-2 my-4 col-span-1 sm:col-span-2 md:col-span-3">
          <Button type="button" variant="outline" onClick={props.onBack}>
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Volver
          </Button>
          <SubmitButton
            disabled={form.formState.isSubmitting}
            loading={form.formState.isSubmitting}
          >
            Continuar
            <ArrowRightIcon className="ml-2 w-4 h-4" />
          </SubmitButton>
        </div>
      </form>
    </Form>
  );
}
