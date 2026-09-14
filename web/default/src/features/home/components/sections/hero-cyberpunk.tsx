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
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { useEffect, useRef, useState } from 'react'

interface HeroCyberpunkProps {
  isAuthenticated: boolean
}

interface ModelStatus {
  name: string
  icon: string
  status: 'healthy' | 'degraded' | 'down'
  latency: string
  load: number
}

const modelStatuses: ModelStatus[] = [
  { name: 'GPT-5', icon: '🤖', status: 'healthy', latency: '32ms', load: 98 },
  { name: 'Claude', icon: '🧠', status: 'healthy', latency: '48ms', load: 96 },
  { name: 'Gemini', icon: '✨', status: 'healthy', latency: '55ms', load: 84 },
  { name: 'Qwen', icon: '🔮', status: 'healthy', latency: '62ms', load: 92 },
  { name: 'DeepSeek', icon: '🌊', status: 'healthy', latency: '71ms', load: 89 },
]

export function HeroCyberpunk({ isAuthenticated }: HeroCyberpunkProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [currentTime, setCurrentTime] = useState('')

  // 实时时钟
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setCurrentTime(
        `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
      )
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  // 星空粒子背景
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio
      canvas.height = canvas.offsetHeight * window.devicePixelRatio
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    }
    resize()
    window.addEventListener('resize', resize)

    class Star {
      x: number
      y: number
      size: number
      opacity: number
      speed: number

      constructor() {
        this.x = Math.random() * canvas.offsetWidth
        this.y = Math.random() * canvas.offsetHeight
        this.size = Math.random() * 1.5 + 0.5
        this.opacity = Math.random() * 0.5 + 0.5
        this.speed = Math.random() * 0.05 + 0.02
      }

      update() {
        this.y += this.speed
        if (this.y > canvas.offsetHeight) {
          this.y = 0
          this.x = Math.random() * canvas.offsetWidth
        }
      }

      draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(148, 163, 255, ${this.opacity})`
        ctx.fill()
      }
    }

    const stars: Star[] = []
    for (let i = 0; i < 200; i++) {
      stars.push(new Star())
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight)
      stars.forEach((star) => {
        star.update()
        star.draw(ctx)
      })
      requestAnimationFrame(animate)
    }
    animate()

    return () => {
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-b from-[#0a0a1f] via-[#0f0a1a] to-[#1a0a2a]">
      {/* 星空背景 */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ width: '100%', height: '100%' }}
      />

      {/* 紫色光效 */}
      <div className="absolute inset-0 pointer-events-none">
        {/* 顶部流动光束 */}
        <div className="absolute top-0 right-1/4 w-[600px] h-[400px] bg-gradient-to-br from-purple-500/30 via-pink-500/20 to-transparent blur-[100px] animate-pulse" />
        {/* 中央径向光晕 */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-radial from-purple-600/20 via-purple-500/10 to-transparent blur-[80px]" />
        {/* 底部光效 */}
        <div className="absolute bottom-0 left-1/4 w-[500px] h-[300px] bg-gradient-to-tr from-blue-500/20 via-purple-500/15 to-transparent blur-[90px]" />
      </div>

      {/* 主要内容容器 */}
      <div className="relative z-10 w-full max-w-[1400px] mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

          {/* 左侧：标题和CTA */}
          <div className="space-y-8">
            <div className="space-y-6">
              <h1 className="text-5xl lg:text-6xl xl:text-7xl font-bold leading-tight">
                <span className="block text-white mb-2">
                  把 AI 的无限可能，
                </span>
                <span className="block bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  接入你的产品
                </span>
              </h1>

              <p className="text-lg text-gray-300 max-w-xl leading-relaxed">
                统一协议、统一计费、统一观测，让每一次调用
                都更快、更稳、更透明。
              </p>
            </div>

            {/* CTA按钮组 */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to={isAuthenticated ? '/panel/dashboard' : '/panel/login'}>
                <Button
                  size="lg"
                  className="group relative overflow-hidden px-8 py-6 text-lg font-semibold bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-xl transition-all duration-300 shadow-[0_0_40px_rgba(139,92,246,0.4)] hover:shadow-[0_0_60px_rgba(139,92,246,0.6)] border-0"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    开始使用
                    <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                </Button>
              </Link>

              <Button
                size="lg"
                variant="outline"
                className="px-8 py-6 text-lg font-semibold bg-transparent hover:bg-purple-500/10 text-purple-300 rounded-xl border-2 border-purple-500/40 hover:border-purple-400 transition-all duration-300"
              >
                探索模型
              </Button>
            </div>

            {/* 能力标签浮岛 */}
            <div className="flex flex-wrap gap-4 pt-8">
              {[
                { icon: '📝', label: '文本', desc: '文本·对话·生成' },
                { icon: '🖼️', label: '视觉', desc: '图像·识别·生成' },
                { icon: '🎵', label: '语音', desc: '语音模型·音乐·配音' },
                { icon: '🧠', label: '推理', desc: '多步推理·逻辑推理' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="group relative px-4 py-3 rounded-2xl bg-gradient-to-br from-purple-900/40 to-blue-900/40 backdrop-blur-xl border border-purple-500/30 hover:border-purple-400/50 transition-all duration-300 hover:scale-105 hover:shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{item.icon}</span>
                    <div>
                      <div className="text-sm font-semibold text-white">{item.label}</div>
                      <div className="text-xs text-gray-400">{item.desc}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 右侧：模型路由中枢面板 */}
          <div className="relative">
            {/* 主面板 */}
            <div className="relative rounded-3xl bg-gradient-to-br from-purple-950/60 to-blue-950/60 backdrop-blur-2xl border border-purple-500/30 shadow-[0_0_60px_rgba(139,92,246,0.3)] overflow-hidden">
              {/* 面板头部 */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-purple-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-sm font-semibold text-white">模型路由中枢</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>实时运行</span>
                  <span className="text-green-400">{currentTime}</span>
                </div>
              </div>

              {/* 模型状态列表 */}
              <div className="p-6 space-y-3">
                {modelStatuses.map((model) => (
                  <div
                    key={model.name}
                    className="group flex items-center justify-between px-4 py-3 rounded-xl bg-black/30 hover:bg-black/50 border border-purple-500/10 hover:border-purple-400/30 transition-all duration-200"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <span className="text-2xl">{model.icon}</span>
                      <span className="text-sm font-medium text-white">{model.name}</span>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* 健康状态 */}
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                        <span className="text-xs text-gray-400">健康</span>
                      </div>

                      {/* 延迟 */}
                      <span className="text-xs font-mono text-purple-300">{model.latency}</span>

                      {/* 负载进度条 */}
                      <div className="w-24 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                          style={{ width: `${model.load}%` }}
                        />
                      </div>

                      {/* 负载百分比 */}
                      <span className="text-xs font-mono text-gray-400 w-8 text-right">{model.load}%</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* 代码示例区 */}
              <div className="mx-6 mb-6">
                <div className="flex items-center gap-2 px-3 py-2 bg-black/40 rounded-t-xl border-b border-purple-500/20">
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  <span className="text-xs font-medium text-purple-300">调用示例</span>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-gray-500">cURL</span>
                    <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                <div className="px-4 py-3 bg-black/40 rounded-b-xl font-mono text-xs overflow-x-auto">
                  <div className="text-purple-300">
                    <span className="text-pink-400">curl</span> https://api.wanxiangyun.cn/v1/chat/completions \
                  </div>
                  <div className="text-purple-300 mt-1">
                    <span className="text-blue-400">-H</span> <span className="text-green-400">"Authorization: Bearer YOUR_API_KEY"</span> \
                  </div>
                  <div className="text-purple-300 mt-1">
                    <span className="text-blue-400">-H</span> <span className="text-green-400">"Content-Type: application/json"</span> \
                  </div>
                  <div className="text-purple-300 mt-1">
                    <span className="text-blue-400">-d</span> <span className="text-orange-400">'{"{"}"model"</span>: <span className="text-green-400">"gpt-4"</span>, <span className="text-orange-400">"messages"</span>: <span className="text-yellow-400">[...]{"}"}'</span>
                  </div>
                </div>
              </div>

              {/* 平均延迟指示器 */}
              <div className="px-6 pb-6">
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-gradient-to-r from-purple-900/50 to-blue-900/50 border border-purple-500/30">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className="text-sm text-gray-300">平均延迟</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-3xl font-bold text-white">42</span>
                    <span className="text-sm text-gray-400">ms</span>
                  </div>
                </div>

                {/* 波形图 */}
                <div className="mt-3 h-12 flex items-end gap-1">
                  {Array.from({ length: 20 }).map((_, i) => {
                    const height = Math.random() * 60 + 40
                    return (
                      <div
                        key={i}
                        className="flex-1 bg-gradient-to-t from-purple-500 to-blue-500 rounded-t opacity-60"
                        style={{ height: `${height}%` }}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 底部渐变遮罩 */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0a1f] to-transparent pointer-events-none" />
    </section>
  )
}
