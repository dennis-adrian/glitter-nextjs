import { ProfileType } from "@/app/api/users/definitions";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import ProfilePicUpload from "@/app/components/user_profile/profile_pic/upload";
import { updateProfilePicture } from "@/app/lib/users/actions";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type ProfilePictureFormProps = {
  profile: ProfileType;
  onSuccess?: () => void;
};
export default function ProfilePictureForm(props: ProfilePictureFormProps) {
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(
    props.profile.imageUrl,
  );
  const form = useForm();

  const action: () => void = form.handleSubmit(async () => {
    if (!uploadedImageUrl) return;

    const res = await updateProfilePicture(props.profile, uploadedImageUrl);
    if (res.success) {
      toast.success(res.message);
      if (props.onSuccess) props.onSuccess();
    } else {
      toast.error(res.message);
    }
  });

  return (
    <>
      <ProfilePicUpload
        imageUrl={uploadedImageUrl}
        setImageUrl={setUploadedImageUrl}
        profile={props.profile}
      />
      <Form {...form}>
        <form onSubmit={action}>
          <SubmitButton
            className="w-full"
            loading={form.formState.isSubmitting}
            disabled={form.formState.isSubmitting}
          >
            Guardar cambios
          </SubmitButton>
        </form>
      </Form>
    </>
  );
}
