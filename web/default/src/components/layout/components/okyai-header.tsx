/*
Copyright (C) 2023-2026 QuantumNous

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
import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const navLinks = [
  { title: '主页', href: '/' },
  { title: '产品', href: '/products' },
  { title: '模型生态', href: '/models' },
  { title: '开发者中心', href: '/docs' },
  { title: '定价', href: '/pricing' },
]

export function OkyaiHeader() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const { auth } = useAuthStore()
  const isAuthenticated = !!auth.user

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className={cn(
          'mx-auto transition-all duration-500',
          scrolled ? 'max-w-5xl px-4 pt-4' : 'max-w-7xl px-6 pt-6'
        )}
      >
        <nav
          className={cn(
            'flex items-center justify-between transition-all duration-500',
            scrolled
              ? 'h-14 rounded-2xl bg-black/60 backdrop-blur-2xl border border-purple-500/20 px-6 shadow-[0_0_40px_rgba(139,92,246,0.2)]'
              : 'h-16 rounded-3xl bg-gradient-to-r from-purple-950/40 to-blue-950/40 backdrop-blur-xl border border-purple-500/30 px-8 shadow-[0_0_60px_rgba(139,92,246,0.3)]'
          )}
        >
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 group-hover:scale-105 transition-transform duration-300">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <span className="text-lg font-bold text-white">万相云算力</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white rounded-lg hover:bg-white/5 transition-all duration-200"
              >
                {t(link.title)}
              </Link>
            ))}
          </div>

          {/* CTA Button */}
          <div className="flex items-center gap-3">
            <Link to={isAuthenticated ? '/panel/dashboard' : '/panel/login'}>
              <Button
                size="sm"
                className="group relative overflow-hidden px-6 py-2 text-sm font-semibold bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-xl transition-all duration-300 shadow-[0_0_20px_rgba(139,92,246,0.4)] hover:shadow-[0_0_30px_rgba(139,92,246,0.6)] border-0"
              >
                <span className="relative z-10 flex items-center gap-2">
                  {isAuthenticated ? t('控制台') : t('登录控制台')}
                  <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </Button>
            </Link>
          </div>
        </nav>
      </div>
    </header>
  )
}
