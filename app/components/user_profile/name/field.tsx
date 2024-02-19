import { ProfileType } from "@/app/api/users/definitions";
import Modal from "@/components/user_profile/modal";
import Form from "@/components/user_profile/name/form";
import {
  UserProfileField,
  UserProfileFieldButton,
} from "@/components/user_profile/user-profile-field";

const NameField = ({ profile }: { profile: ProfileType }) => {
  return (
    <UserProfileField
      label="Nombre completo"
      value={`${profile.firstName} ${profile.lastName}`}
    >
      <Modal profile={profile} title="Editar Nombre" FormComponent={Form}>
        <UserProfileFieldButton />
      </Modal>
    </UserProfileField>
  );
};

export default NameField;
