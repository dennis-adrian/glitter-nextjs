import { ProfileType } from "@/app/api/users/definitions";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import ProfilePicUpload from "@/app/components/user_profile/profile_pic/upload";
import { updateProfilePicture } from "@/app/lib/users/actions";
import { ArrowDownToLineIcon } from "lucide-react";
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
  const [uploadStarted, setUploadStarted] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
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
    <div className="flex flex-col gap-4 w-full">
      <div className="w-full border border-dashed border-primary-500 rounded-md p-4">
        <ProfilePicUpload
          imageUrl={uploadedImageUrl}
          setImageUrl={setUploadedImageUrl}
          profile={props.profile}
          onUploading={(isUploading) => {
            setIsUploading(isUploading);
            setUploadStarted(true);
          }}
        />
      </div>
      <Form {...form}>
        <form onSubmit={action} className="w-full">
          <SubmitButton
            className="w-full"
            loading={form.formState.isSubmitting || isUploading}
            disabled={
              form.formState.isSubmitting ||
              isUploading ||
              !uploadStarted ||
              form.formState.isSubmitted
            }
          >
            Guardar cambios
            <ArrowDownToLineIcon className="w-4 h-4 ml-2" />
          </SubmitButton>
        </form>
      </Form>
    </div>
  );
}
