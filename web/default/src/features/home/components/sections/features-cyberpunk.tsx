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
import { useTranslation } from 'react-i18next'

interface Feature {
  icon: string
  title: string
  description: string
  gradient: string
}

const features: Feature[] = [
  {
    icon: '🔀',
    title: '智能路由',
    description: '基于实际负载与提供商能力，自动选择最优模型与节点。',
    gradient: 'from-purple-600/20 to-pink-600/20',
  },
  {
    icon: '🎨',
    title: '多模态',
    description: '文本、图像、语音、视频多线支撑，释放多模态的巨营力。',
    gradient: 'from-blue-600/20 to-purple-600/20',
  },
  {
    icon: '📊',
    title: '可观测性',
    description: '全链路监控、详细统计、调用分析，让每一次调用清晰可见。',
    gradient: 'from-cyan-600/20 to-blue-600/20',
  },
  {
    icon: '🛡️',
    title: '企业安全',
    description: '数据加密、权限管控、合规审计，为企业业务提供坚固点。',
    gradient: 'from-pink-600/20 to-purple-600/20',
  },
]

export function FeaturesCyberpunk() {
  const { t } = useTranslation()

  return (
    <section className="relative py-24 overflow-hidden bg-gradient-to-b from-[#1a0a2a] via-[#0f0a1a] to-[#0a0a1f]">
      {/* 背景光效 */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group relative p-8 rounded-3xl bg-gradient-to-br from-black/40 to-black/20 backdrop-blur-xl border border-purple-500/20 hover:border-purple-400/40 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(139,92,246,0.2)]"
            >
              {/* 内部渐变光效 */}
              <div className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

              {/* 内容 */}
              <div className="relative z-10 space-y-4">
                {/* 图标 */}
                <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600/30 to-blue-600/30 backdrop-blur-sm border border-purple-500/30 group-hover:scale-110 transition-transform duration-300">
                  <span className="text-3xl">{feature.icon}</span>
                </div>

                {/* 标题 */}
                <h3 className="text-xl font-bold text-white">
                  {t(feature.title)}
                </h3>

                {/* 描述 */}
                <p className="text-sm text-gray-400 leading-relaxed">
                  {t(feature.description)}
                </p>
              </div>

              {/* 装饰性光点 */}
              <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-purple-400/50 group-hover:bg-purple-400 transition-colors duration-300" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
