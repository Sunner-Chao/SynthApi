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
import { Link } from '@tanstack/react-router'
import { CherryStudio } from '@lobehub/icons'
import { ArrowRight, BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useStatus } from '@/hooks/use-status'
import { Button } from '@/components/ui/button'
import { HeroTerminalDemo } from '../hero-terminal-demo'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
}

// Stylized three-dots indicator representing "More"
const MoreIcon = () => (
  <svg
    className='text-muted-foreground/60 group-hover:text-foreground size-6 shrink-0 transition-colors'
    viewBox='0 0 24 24'
    fill='none'
    xmlns='http://www.w3.org/2000/svg'
  >
    <circle cx='6' cy='12' r='2' fill='currentColor' />
    <circle cx='12' cy='12' r='2' fill='currentColor' />
    <circle cx='18' cy='12' r='2' fill='currentColor' />
  </svg>
)

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const rawDocsUrl = status?.docs_link as string | undefined
  const docsUrl =
    rawDocsUrl && !rawDocsUrl.includes('docs.newapi.pro') ? rawDocsUrl : '/docs'

  const renderDocsButton = () => {
    const isExternal = docsUrl.startsWith('http')
    if (isExternal) {
      return (
        <Button
          variant='outline'
          className='group border-border/50 hover:border-border hover:bg-muted/50 inline-flex h-11 items-center gap-1.5 rounded-lg px-5 text-sm font-medium'
          render={
            <a href={docsUrl} target='_blank' rel='noopener noreferrer' />
          }
        >
          <BookOpen className='text-muted-foreground/80 group-hover:text-foreground size-4 transition-colors duration-200' />
          <span>{t('Docs')}</span>
        </Button>
      )
    }
    return (
      <Button
        variant='outline'
        className='group border-border/50 hover:border-border hover:bg-muted/50 inline-flex h-11 items-center gap-1.5 rounded-lg px-5 text-sm font-medium'
        render={<Link to={docsUrl} />}
      >
        <BookOpen className='text-muted-foreground/80 group-hover:text-foreground size-4 transition-colors duration-200' />
        <span>{t('Docs')}</span>
      </Button>
    )
  }

  return (
    <section className='synthpay-home-hero'>
      <div className='synthpay-home-hero-inner'>
        <div className='synthpay-home-copy'>
          <span className='synthpay-eyebrow'>
            {t('AI Application Infrastructure Foundation')}
          </span>
          <h1>
            {t('Unified API Gateway for')}
            <br />
            <strong>{t('Vast Range of AI Models')}</strong>
          </h1>
          <p>
            {t(
              'Access a vast selection of models via a standard, unified API protocol. Power AI applications, manage digital assets, and connect the Future.'
            )}
          </p>
          <div className='synthpay-home-actions'>
            {props.isAuthenticated ? (
              <Button render={<Link to='/dashboard' />}>
                {t('Go to Dashboard')}
                <ArrowRight data-icon='inline-end' />
              </Button>
            ) : (
              <Button render={<Link to='/sign-up' />}>
                {t('Get Started')}
                <ArrowRight data-icon='inline-end' />
              </Button>
            )}
            {!props.isAuthenticated && (
              <Button variant='outline' render={<Link to='/pricing' />}>
                {t('View Pricing')}
              </Button>
            )}
            {renderDocsButton()}
          </div>
          <div className='synthpay-supported-apps'>
            <div>
              <span>{t('Supported Applications')}</span>
              <p>
                {t(
                  'Supports one-click configuration and perfectly adapts to SynthAPI multi-protocol configuration.'
                )}
              </p>
            </div>
            <div className='synthpay-app-list'>
              <a href='https://cherry-ai.com' target='_blank' rel='noreferrer'>
                <CherryStudio.Color size={24} />
                <span>Cherry Studio</span>
              </a>
              <a href='https://ccswitch.io' target='_blank' rel='noreferrer'>
                <span className='synthpay-app-mark'>CC</span>
                <span>CC Switch</span>
              </a>
              <span className='synthpay-more-apps'>
                <MoreIcon />
                <span>{t('More Apps')}</span>
              </span>
            </div>
          </div>
        </div>
        <div className='synthpay-home-demo'>
          <HeroTerminalDemo className='synthpay-hero-terminal' />
        </div>
      </div>
    </section>
  )
}
