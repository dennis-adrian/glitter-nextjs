import { UserProfileType } from '@/app/api/users/actions';
import {
  UserProfileField,
  UserProfileFieldButton,
} from '@/components/user_profile/user-profile-field';
import Modal from '@/components/user_profile/modal';
import Form from './form';

const BirthdateField = ({ profile }: { profile: UserProfileType }) => {
  return (
    <UserProfileField
      label="Fecha de nacimiento"
      value={profile.birthdate?.toLocaleDateString('es-ES')}
    >
      <Modal
        profile={profile}
        title="Editar Fecha de Nacimiento"
        FormComponent={Form}
      >
        <UserProfileFieldButton />
      </Modal>
    </UserProfileField>
  );
};

export default BirthdateField;
