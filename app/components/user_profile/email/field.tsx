import { ProfileType } from '@/app/api/users/definitions';
import {
  UserProfileField,
  UserProfileFieldButton,
} from '@/components/user_profile/user-profile-field';

const EmailField = ({ profile }: { profile: ProfileType }) => {
  return (
    <UserProfileField label="Correo electrónico" value={profile.email}>
      <UserProfileFieldButton disabled />
    </UserProfileField>
  );
};

export default EmailField;
