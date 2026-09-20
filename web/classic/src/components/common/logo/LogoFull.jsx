/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React from 'react';

/** Complete SynthAPI artwork: icon and wordmark from the configured logo. */
const LogoFull = ({ src, alt = 'logo', className = '' }) => {
  const isBundledLogo = /(?:^|\/)logo(?:\.png|-light\.png)(?:\?|$)/.test(src || '');
  if (!isBundledLogo) {
    return <img src={src} alt={alt} className={`object-contain object-left ${className}`} />;
  }
  const logoSrc = '/logo-light.png?v=synthapi-logo-crop-v1-20260828';
  const darkLogoSrc = '/logo-dark.png?v=synthapi-logo-dark-crop-v1-20260828';
  return (
    <span className={`relative inline-block shrink-0 ${className}`} role='img' aria-label={alt}>
      <img src={logoSrc} alt='' aria-hidden='true' className='h-full w-full object-contain object-left dark:hidden' />
      <img src={darkLogoSrc} alt='' aria-hidden='true' className='hidden h-full w-full object-contain object-left dark:block' />
    </span>
  );
};

export default LogoFull;
