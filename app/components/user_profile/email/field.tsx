import { UserProfileType } from '@/app/api/users/actions';
import {
  UserProfileField,
  UserProfileFieldButton,
} from '@/components/user_profile/user-profile-field';

const EmailField = ({ profile }: { profile: UserProfileType }) => {
  return (
    <UserProfileField label="Correo electrónico" value={profile.email}>
      <UserProfileFieldButton disabled />
    </UserProfileField>
  );
};

export default EmailField;
