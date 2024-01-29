import { UserProfileType } from '@/app/api/users/actions';
import {
  UserProfileField,
  UserProfileFieldButton,
} from '@/components/user_profile/user-profile-field';
import Modal from '@/components/user_profile/modal';
import Form from './form';

const PhoneField = ({ profile }: { profile: UserProfileType }) => {
  return (
    <UserProfileField
      label="Número de teléfono"
      value={profile?.phoneNumber && `+591 ${profile?.phoneNumber}`}
    >
      <Modal profile={profile} title="Editar Número de Teléfono" FormComponent={Form}>
        <UserProfileFieldButton />
      </Modal>
    </UserProfileField>
  );
};

export default PhoneField;
