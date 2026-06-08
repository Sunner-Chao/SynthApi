/*
Copyright (C) 2023-2026 SynthAPI

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

For commercial licensing, please contact support@synthapi.com
*/
import { type SVGProps } from 'react'
import { cn } from '@/lib/utils'

export function Logo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      id='synthapi-logo'
      viewBox='0 0 32 32'
      xmlns='http://www.w3.org/2000/svg'
      height='32'
      width='32'
      fill='none'
      className={cn('size-8', className)}
      {...props}
    >
      <title>SynthAPI</title>
      <defs>
        <linearGradient id='synthGrad1' x1='0%' y1='0%' x2='100%' y2='100%'>
          <stop offset='0%' stopColor='#6366f1' />
          <stop offset='100%' stopColor='#8b5cf6' />
        </linearGradient>
        <linearGradient id='synthGrad2' x1='0%' y1='0%' x2='100%' y2='100%'>
          <stop offset='0%' stopColor='#06b6d4' />
          <stop offset='100%' stopColor='#3b82f6' />
        </linearGradient>
      </defs>
      <circle cx='16' cy='16' r='15' fill='url(#synthGrad1)' />
      <circle
        cx='16'
        cy='16'
        r='12'
        fill='none'
        stroke='url(#synthGrad2)'
        strokeWidth='1.5'
        opacity='0.6'
      />
      <path
        d='M11 11C11 8.5 12.5 7 14.5 7.5C16.5 8 17.5 10 16.5 11.5C15.5 13 12.5 14 11.5 16C10.5 18 11.5 21 14 21.5C16.5 22 18 20.5 18 18.5'
        stroke='white'
        strokeWidth='2.5'
        strokeLinecap='round'
        fill='none'
      />
      <line
        x1='20'
        y1='12'
        x2='24'
        y2='12'
        stroke='white'
        strokeWidth='1.5'
        strokeLinecap='round'
        opacity='0.8'
      />
      <circle cx='25' cy='12' r='1' fill='white' opacity='0.8' />
      <line
        x1='20'
        y1='16'
        x2='25'
        y2='16'
        stroke='white'
        strokeWidth='1.5'
        strokeLinecap='round'
        opacity='0.9'
      />
      <circle cx='26' cy='16' r='1' fill='white' opacity='0.9' />
      <line
        x1='20'
        y1='20'
        x2='24'
        y2='20'
        stroke='white'
        strokeWidth='1.5'
        strokeLinecap='round'
        opacity='0.8'
      />
      <circle cx='25' cy='20' r='1' fill='white' opacity='0.8' />
    </svg>
  )
}
