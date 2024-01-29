import { UserProfileType } from '@/app/api/users/actions';
import {
  UserProfileField,
  UserProfileFieldButton,
} from '@/components/user_profile/user-profile-field';
import Modal from '@/components/user_profile/modal';
import Form from '@/components/user_profile/name/form';

const NameField = ({ profile }: { profile: UserProfileType }) => {
  return (
    <UserProfileField
      label="Nombre"
      value={`${profile.firstName} ${profile.lastName}`}
    >
      <Modal profile={profile} title="Editar Nombre" FormComponent={Form}>
        <UserProfileFieldButton />
      </Modal>
    </UserProfileField>
  );
};

export default NameField;
