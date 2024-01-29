import { UserProfileField, UserProfileFieldButton } from '@/app/components/user-profile-field';
import Modal from './modal';

const NameField = ({
  firstName,
  lastName,
}: {
  firstName: string;
  lastName: string;
}) => {
  return (
    <UserProfileField
      label="Nombre"
      value={`${firstName} ${lastName}`}
    >
      <Modal title="Editar Nombre">
        <UserProfileFieldButton />
      </Modal>
    </UserProfileField>
  );
};

export default NameField;
