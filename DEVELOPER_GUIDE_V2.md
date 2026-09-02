# Square UI V2 开发者指南

## 快速开始

### 本地开发环境设置

```bash
# 克隆仓库
git clone https://github.com/Sunner-Chao/SynthApi.git
cd SynthApi

# 安装依赖（使用 Bun）
cd web/default
bun install

# 启动开发服务器
bun run dev

# 在浏览器中打开
# http://localhost:3000/dashboard
```

---

## 项目结构

```
web/default/
├── src/
│   ├── components/
│   │   ├── square-ui/              ← Square UI 组件库
│   │   │   ├── stat-card.tsx       ← 统计卡片
│   │   │   ├── chart-card.tsx      ← 图表卡片
│   │   │   ├── quick-action-card.tsx ← 快捷操作
│   │   │   └── upgrade-card.tsx    ← 升级卡片
│   │   └── ui/                     ← Base UI 组件
│   ├── features/
│   │   └── dashboard/
│   │       └── components/
│   │           └── overview/
│   │               ├── overview-dashboard.tsx (旧版)
│   │               └── overview-dashboard-v2.tsx (新版)
│   ├── styles/
│   │   ├── square-ui-theme.css     ← 主题系统
│   │   ├── square-ui.css           ← 布局系统
│   │   ├── square-layout.css       ← 旧版布局（保留）
│   │   └── index.css               ← 入口文件
│   └── i18n/                       ← 国际化
│       └── locales/
│           ├── en.json
│           ├── zh.json
│           ├── fr.json
│           ├── ru.json
│           ├── ja.json
│           └── vi.json
```

---

## 核心概念

### 1. Square UI 设计系统

#### 色彩系统 (OKLCH)

OKLCH 色彩空间提供感知均匀的颜色：

```css
/* Light Mode */
:root {
  --background: oklch(1 0 0);           /* 纯白 */
  --foreground: oklch(0.145 0 0);       /* 深黑 */
  --primary: oklch(0.205 0 0);          /* 主色 */
  --success: oklch(0.65 0.18 145);      /* 成功绿 */
  --warning: oklch(0.75 0.15 85);       /* 警告黄 */
  --destructive: oklch(0.577 0.245 27.325); /* 错误红 */
}

/* Dark Mode */
.dark {
  --background: oklch(0.145 0 0);       /* 深黑 */
  --foreground: oklch(0.985 0 0);       /* 接近白 */
  --primary: oklch(0.985 0 0);          /* 白色 */
}
```

**使用示例**:

```tsx
// 使用 Tailwind 工具类
<div className="bg-background text-foreground">
  <button className="bg-primary text-primary-foreground">
    Click Me
  </button>
</div>
```

#### 网格系统

```css
/* 2 列网格 */
.square-ui-grid-2 {
  @apply grid grid-cols-1 lg:grid-cols-2 gap-4;
}

/* 3 列网格 */
.square-ui-grid-3 {
  @apply grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4;
}

/* 4 列网格 */
.square-ui-grid-4 {
  @apply grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4;
}
```

**使用示例**:

```tsx
<div className="square-ui-grid-4">
  <StatCard {...props1} />
  <StatCard {...props2} />
  <StatCard {...props3} />
  <StatCard {...props4} />
</div>
```

---

### 2. 组件 API

#### StatCard

统计卡片组件，显示数值指标和趋势。

**Props**:

```typescript
interface StatCardProps {
  title: string                    // 卡片标题
  value: string | number          // 显示的数值
  icon: LucideIcon                // Lucide 图标组件
  trend?: {                       // 可选的趋势指示器
    value: number                 // 趋势百分比
    isPositive: boolean           // 是否为正向趋势
  }
  description?: string            // 可选的描述文本
  delay?: number                  // 动画延迟（秒）
  className?: string              // 自定义样式类
}
```

**示例**:

```tsx
import { Activity } from 'lucide-react'
import { StatCard } from '@/components/square-ui/stat-card'

<StatCard
  title="Total Requests"
  value={formatNumber(12345)}
  icon={Activity}
  trend={{ value: 12.5, isPositive: true }}
  description="Last 30 days"
  delay={0}
/>
```

#### ChartCard

图表容器组件，带标题和描述。

**Props**:

```typescript
interface ChartCardProps {
  title: string                   // 标题
  description?: string            // 可选描述
  children: React.ReactNode       // 图表内容
  delay?: number                  // 动画延迟
  className?: string              // 自定义样式
}
```

**示例**:

```tsx
import { ChartCard } from '@/components/square-ui/chart-card'

<ChartCard
  title="Usage Overview"
  description="API usage in the last 7 days"
  delay={0.2}
  className="lg:col-span-2"
>
  <YourChartComponent />
</ChartCard>
```

#### QuickActionCard

快捷操作卡片，带图标和跳转链接。

**Props**:

```typescript
interface QuickActionCardProps {
  title: string                   // 标题
  description: string             // 描述
  icon: LucideIcon               // 图标
  href: string                   // 跳转链接
  delay?: number                 // 动画延迟
  className?: string             // 自定义样式
}
```

**示例**:

```tsx
import { KeyRound } from 'lucide-react'
import { QuickActionCard } from '@/components/square-ui/quick-action-card'

<QuickActionCard
  title="API Keys"
  description="Manage your API keys"
  icon={KeyRound}
  href="/keys"
  delay={0.25}
/>
```

#### UpgradeCard

升级推广卡片。

**Props**:

```typescript
interface UpgradeCardProps {
  delay?: number                 // 动画延迟
  className?: string             // 自定义样式
}
```

**示例**:

```tsx
import { UpgradeCard } from '@/components/square-ui/upgrade-card'

<UpgradeCard delay={0.4} />
```

---

### 3. 动画系统

使用 **Framer Motion** 实现流畅动画。

#### 基础动画模式

```tsx
import { motion } from 'motion/react'

// 淡入 + 向上移动
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
>
  Content
</motion.div>

// 淡入 + 从左移动
<motion.div
  initial={{ opacity: 0, x: -10 }}
  animate={{ opacity: 1, x: 0 }}
  transition={{ delay: 0, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
>
  Content
</motion.div>
```

#### Stagger 动画

```tsx
// 父容器
<motion.div
  initial="hidden"
  animate="visible"
  variants={{
    visible: {
      transition: {
        staggerChildren: 0.05
      }
    }
  }}
>
  {/* 子元素 */}
  {items.map((item, i) => (
    <motion.div
      key={i}
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
      }}
    >
      {item}
    </motion.div>
  ))}
</motion.div>
```

#### Easing 曲线

推荐使用的缓动曲线：

```typescript
// Smooth ease-out
ease: [0.22, 1, 0.36, 1]

// Quick snap
ease: [0.4, 0, 0.2, 1]

// Bounce
ease: [0.68, -0.55, 0.265, 1.55]
```

---

### 4. 响应式设计

#### Breakpoints

```typescript
// Tailwind 默认断点
const breakpoints = {
  sm: '640px',   // Mobile landscape
  md: '768px',   // Tablet
  lg: '1024px',  // Desktop
  xl: '1280px',  // Large desktop
  '2xl': '1536px'
}
```

#### 响应式网格示例

```tsx
// 移动端 1 列，平板 2 列，桌面 4 列
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>

// 移动端隐藏，桌面显示
<div className="hidden lg:block">
  <Sidebar />
</div>

// 移动端显示，桌面隐藏
<div className="block lg:hidden">
  <MobileMenu />
</div>
```

---

### 5. 国际化

使用 `react-i18next` 进行国际化。

#### 使用翻译

```tsx
import { useTranslation } from 'react-i18next'

function Component() {
  const { t } = useTranslation()
  
  return (
    <div>
      <h1>{t('Dashboard')}</h1>
      <p>{t('Welcome back')}, {user.name}</p>
      <p>{t('Out of {{total}}', { total: 10 })}</p>
    </div>
  )
}
```

#### 添加新翻译

1. 在 `src/i18n/locales/en.json` 中添加英文键值：

```json
{
  "New Feature": "New Feature",
  "Feature description": "Feature description"
}
```

2. 运行同步命令自动生成其他语言的占位符：

```bash
bun run i18n:sync
```

3. 手动翻译其他语言文件。

---

## 开发工作流

### 1. 创建新页面

```bash
# 1. 创建页面目录
mkdir -p src/features/my-page/components

# 2. 创建页面组件
touch src/features/my-page/components/my-page.tsx

# 3. 使用 Square UI 组件
```

```tsx
// src/features/my-page/components/my-page.tsx
import { StatCard } from '@/components/square-ui/stat-card'
import { ChartCard } from '@/components/square-ui/chart-card'
import { Activity } from 'lucide-react'

export function MyPage() {
  return (
    <div className="square-ui-app-container">
      <div className="square-ui-content-container">
        <div className="square-ui-header">
          <h1>My Page</h1>
        </div>
        
        <div className="p-4 md:p-7">
          <div className="square-ui-section">
            <div className="square-ui-grid-4">
              <StatCard
                title="Metric 1"
                value={100}
                icon={Activity}
              />
              {/* More stats */}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

### 2. 添加新组件

```bash
# 1. 创建组件文件
touch src/components/square-ui/my-component.tsx

# 2. 定义组件
```

```tsx
// src/components/square-ui/my-component.tsx
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

interface MyComponentProps {
  title: string
  className?: string
}

export function MyComponent({ title, className }: MyComponentProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-lg border border-border bg-card p-4',
        className
      )}
    >
      <h3 className="text-lg font-semibold">{title}</h3>
    </motion.div>
  )
}
```

### 3. 修改样式

```bash
# 编辑主题文件
vim src/styles/square-ui-theme.css

# 添加自定义类
```

```css
/* src/styles/square-ui-theme.css */
@layer components {
  .my-custom-card {
    @apply rounded-xl border border-border bg-card p-4;
    @apply shadow-sm hover:shadow-md;
    @apply transition-all duration-200;
  }
}
```

---

## 构建和部署

### 开发构建

```bash
cd web/default
bun run dev
```

### 生产构建

```bash
cd web/default
bun run build

# 输出: web/default/dist/
```

### 类型检查

```bash
bun run typecheck
```

### Lint 检查

```bash
bun run lint
```

### 格式化

```bash
bun run format
```

---

## 调试技巧

### 1. React DevTools

安装浏览器扩展:
- Chrome: React Developer Tools
- Firefox: React DevTools

### 2. 性能分析

```tsx
import { Profiler } from 'react'

<Profiler id="Dashboard" onRender={onRenderCallback}>
  <Dashboard />
</Profiler>
```

### 3. Framer Motion DevTools

```bash
# 安装
bun add framer-motion-devtools

# 使用
import { DevTools } from 'framer-motion-devtools'

<DevTools />
```

### 4. 日志调试

```tsx
// 开发环境日志
if (import.meta.env.DEV) {
  console.log('Debug info:', data)
}
```

---

## 常见问题

### Q1: 动画不流畅

**解决方案**:
- 确保只动画化 `transform` 和 `opacity`
- 避免动画化 `width`, `height`, `margin`, `padding`
- 使用 `will-change` 提示浏览器优化

```tsx
<motion.div
  style={{ willChange: 'transform' }}
  animate={{ x: 100 }}
>
  Content
</motion.div>
```

### Q2: 颜色在某些浏览器不显示

**原因**: 旧浏览器不支持 OKLCH

**解决方案**: 使用 PostCSS 插件自动降级

```bash
bun add postcss-oklch-to-rgb
```

### Q3: 构建后文件过大

**解决方案**:
- 使用 Code Splitting
- 启用 Tree Shaking
- 压缩图片资源

```tsx
// 动态导入
const HeavyComponent = lazy(() => import('./HeavyComponent'))

<Suspense fallback={<Loading />}>
  <HeavyComponent />
</Suspense>
```

### Q4: i18n 翻译缺失

**解决方案**:
- 检查 `locales/*.json` 文件
- 运行 `bun run i18n:sync`
- 确保键名在所有语言文件中存在

---

## 最佳实践

### 1. 组件设计

✅ **Do**:
- 保持组件单一职责
- 使用 TypeScript 严格类型
- 提供合理的默认值
- 支持 className 扩展

❌ **Don't**:
- 在组件内部硬编码样式
- 混合业务逻辑和 UI 逻辑
- 忽略可访问性

### 2. 性能优化

✅ **Do**:
- 使用 `React.memo` 避免不必要的重渲染
- 使用 `useMemo` 缓存计算结果
- 使用 `useCallback` 缓存函数引用
- 实现虚拟滚动处理大列表

❌ **Don't**:
- 过度优化（premature optimization）
- 在不必要的地方使用 memo
- 忽略性能监控

### 3. 样式管理

✅ **Do**:
- 优先使用 Tailwind 工具类
- 使用 CSS 变量定义主题
- 保持样式与组件同目录

❌ **Don't**:
- 编写全局样式污染
- 使用内联样式（除非动态）
- 硬编码颜色值

---

## 扩展阅读

### 官方文档

- [Tailwind CSS](https://tailwindcss.com/)
- [Framer Motion](https://www.framer.com/motion/)
- [React i18next](https://react.i18next.com/)
- [Lucide Icons](https://lucide.dev/)

### 设计系统

- [Square UI](https://github.com/ln-dev7/square-ui)
- [OKLCH Color Space](https://oklch.com/)
- [Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

### 工具

- [Bun](https://bun.sh/)
- [Rsbuild](https://rsbuild.dev/)
- [TypeScript](https://www.typescriptlang.org/)

---

## 贡献指南

### 提交代码

1. Fork 仓库
2. 创建功能分支: `git checkout -b feature/my-feature`
3. 提交更改: `git commit -m 'feat: add my feature'`
4. 推送分支: `git push origin feature/my-feature`
5. 创建 Pull Request

### Commit 规范

使用 Conventional Commits:

```
feat: 新功能
fix: Bug 修复
docs: 文档更新
style: 代码格式（不影响功能）
refactor: 重构
perf: 性能优化
test: 测试
chore: 构建/工具
```

---

## 许可证

Copyright (C) 2023-2026 QuantumNous

本项目基于 GNU Affero General Public License v3.0 许可。

---

**维护者**: QuantumNous Team
**最后更新**: 2026-09-02
**版本**: v2.0.0
