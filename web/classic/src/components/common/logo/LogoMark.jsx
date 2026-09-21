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

const LogoMark = ({ src, alt = 'logo', className = '' }) => {
  const isBundledLogo = /(?:^|\/)logo\.png(?:\?|$)/.test(src || '');

  if (!isBundledLogo) {
    return <img src={src} alt={alt} className={`object-contain ${className}`} />;
  }

  const markSrc = '/logo-mark.png?v=synthapi-logo-crop-v1-20260828';

  return (
    <span
      className={`relative inline-block h-6 w-6 shrink-0 overflow-hidden rounded-md ${className}`}
      role='img'
      aria-label={alt}
    >
      <img
        src={markSrc}
        alt=''
        aria-hidden='true'
        className='absolute inset-y-0 left-0 h-full w-auto max-w-none object-contain object-left'
      />
    </span>
  );
};

export default LogoMark;
