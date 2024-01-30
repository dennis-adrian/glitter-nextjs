'use client';

import React from 'react';
import { SingleImageDropzoneUsage } from '@/app/components/user_profile/profile_pic/form';
import { UserProfileType } from '@/app/api/users/actions';

const ProfilePictureField = ({ profile }: { profile: UserProfileType }) => {
  return (
    <SingleImageDropzoneUsage profile={profile} />
  );
};

export default ProfilePictureField;
