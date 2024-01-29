import { UserProfileType } from '@/app/api/users/actions';
import {
  UserProfileField,
  UserProfileFieldButton,
} from '@/app/components/user-profile-field';
import Modal from './modal';

const NameField = ({ profile }: { profile: UserProfileType }) => {
  return (
    <UserProfileField
      label="Nombre"
      value={`${profile.firstName} ${profile.lastName}`}
    >
      <Modal profile={profile} title="Editar Nombre">
        <UserProfileFieldButton />
      </Modal>
    </UserProfileField>
  );
};

export default NameField;
