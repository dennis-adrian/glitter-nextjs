import { ProfileType } from "@/app/api/users/definitions";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import ProfilePicUpload from "@/app/components/user_profile/profile_pic/upload";
import { useForm } from "react-hook-form";

type ProfilePictureFormProps = {
  profile: ProfileType;
  // onSuccess: () => void;
};
export default function ProfilePictureForm(props: ProfilePictureFormProps) {
  const form = useForm();

  const action: () => void = form.handleSubmit(async () => {
    // const res = await updateProfilePicture(props.profile, );
    // if (res.success) {
    //   toast.success(res.message);
    // } else {
    //   toast.error(res.message);
    // }
  });

  return (
    <>
      <ProfilePicUpload profile={props.profile} />
      <Form {...form}>
        <form>
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
