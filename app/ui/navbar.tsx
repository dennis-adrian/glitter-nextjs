import React from 'react'
import Image from 'next/image';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars } from '@fortawesome/free-solid-svg-icons/faBars';
import { faUser } from '@fortawesome/free-regular-svg-icons/faUser';

const Navbar = () => {
  return (
    <div className="flex justify-between bg-gradient-darker py-2 px-3">
      <FontAwesomeIcon icon={faBars} className="text-white w-6" />
      <Image
        src="/img/glitter_logo.png"
        alt="Logo Glitter"
        width={150}
        height={56}
      />
      <FontAwesomeIcon icon={faUser} className="text-white w-6" />
    </div>
  )
}

export default Navbar;