import { IconDefinition } from '@fortawesome/free-brands-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';

type Props = {
  icon?: IconDefinition;
  children: React.ReactNode;
  onClick?: () => void;
};

const Button = ({ children, icon, onClick }: Props) => {
  return (
    <button
      className="m-auto flex h-14 items-center rounded-2xl bg-primary py-3 px-5 text-white drop-shadow-lg"
      onClick={onClick}
    >
      {children}
      {icon ? <FontAwesomeIcon className="w-6 ml-2" icon={icon} /> : null}
    </button>
  );
};

export default Button;
