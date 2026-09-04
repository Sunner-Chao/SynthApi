export interface ImageSelectOption {
  value: string
  label: string
}

export interface ImageModelConfig {
  summary: string
  defaultResolution?: string
  resolutions?: ImageSelectOption[]
  sizeField?: 'size' | 'aspect_ratio'
  maxImages: number
  maxReferences: number
  qualities?: ImageSelectOption[]
  defaultQuality?: string
  supportsOutputFormat?: boolean
  supportsSeed?: boolean
  supportsWatermark?: boolean
  supportsNegativePrompt?: boolean
  supportsPromptExtend?: boolean
  supportsPromptUpsampling?: boolean
  supportsGoogleSearch?: boolean
  supportsThinkingMode?: boolean
  supportsSequential?: boolean
  sourcePrices: Record<string, number>
}

const resolution = (...values: string[]): ImageSelectOption[] =>
  values.map((value) => ({ value: value.toLowerCase(), label: value }))

const quality = (...values: string[]): ImageSelectOption[] =>
  values.map((value) => ({ value: value.toLowerCase(), label: value }))

const flat = (sourceUSD: number): Record<string, number> => ({
  default: sourceUSD,
})

export const APIMART_MODEL_CONFIGS: Record<string, ImageModelConfig> = {
  'flux-2-flex': {
    summary: '可调步数与引导强度，适合精细控制。',
    defaultResolution: '2mp',
    resolutions: resolution('1MP', '2MP', '3MP', '4MP'),
    maxImages: 1,
    maxReferences: 8,
    supportsOutputFormat: true,
    supportsSeed: true,
    supportsPromptUpsampling: true,
    sourcePrices: { '1mp': 0.04, '2mp': 0.08, '3mp': 0.12, '4mp': 0.16 },
  },
  'flux-2-max': {
    summary: 'FLUX 2 高质量版本，细节与一致性优先。',
    defaultResolution: '2mp',
    resolutions: resolution('1MP', '2MP', '3MP', '4MP'),
    maxImages: 1,
    maxReferences: 8,
    supportsOutputFormat: true,
    supportsSeed: true,
    supportsPromptUpsampling: true,
    sourcePrices: { '1mp': 0.056, '2mp': 0.08, '3mp': 0.104, '4mp': 0.128 },
  },
  'flux-2-pro': {
    summary: '质量、速度和成本均衡的 FLUX 2 版本。',
    defaultResolution: '2mp',
    resolutions: resolution('1MP', '2MP', '3MP', '4MP'),
    maxImages: 1,
    maxReferences: 8,
    supportsOutputFormat: true,
    supportsSeed: true,
    supportsPromptUpsampling: true,
    sourcePrices: { '1mp': 0.024, '2mp': 0.036, '3mp': 0.048, '4mp': 0.06 },
  },
  'flux-kontext-max': {
    summary: '约 1MP 输出，擅长多参考图编辑。',
    maxImages: 1,
    maxReferences: 4,
    supportsOutputFormat: true,
    supportsPromptUpsampling: true,
    sourcePrices: flat(0.064),
  },
  'flux-kontext-pro': {
    summary: '高性价比参考图编辑与风格迁移。',
    maxImages: 1,
    maxReferences: 4,
    supportsOutputFormat: true,
    supportsPromptUpsampling: true,
    sourcePrices: flat(0.032),
  },
  'gemini-2.5-flash-image-preview': {
    summary: 'Nano Banana，固定 1K，适合快速生成与编辑。',
    defaultResolution: '1k',
    resolutions: resolution('1K'),
    maxImages: 1,
    maxReferences: 14,
    sourcePrices: flat(0.0125),
  },
  'gemini-3-pro-image-preview': {
    summary: 'Nano Banana Pro，强化文字、构图和细节。',
    defaultResolution: '1k',
    resolutions: resolution('1K', '2K'),
    maxImages: 1,
    maxReferences: 14,
    supportsGoogleSearch: true,
    sourcePrices: { '1k': 0.03, '2k': 0.03 },
  },
  'gemini-3.1-flash-image-preview': {
    summary: 'Nano Banana 2，支持 0.5K–4K 与搜索增强。',
    defaultResolution: '1k',
    resolutions: resolution('0.5K', '1K', '2K', '4K'),
    maxImages: 1,
    maxReferences: 14,
    supportsGoogleSearch: true,
    sourcePrices: { '0.5k': 0.015, '1k': 0.015, '2k': 0.02, '4k': 0.025 },
  },
  'gemini-3.1-flash-lite-image': {
    summary: 'Nano Banana Lite，固定 1K，按 Token 结算。',
    defaultResolution: '1k',
    resolutions: resolution('1K'),
    maxImages: 4,
    maxReferences: 14,
    sourcePrices: flat(0.0336),
  },
  'gpt-image-2': {
    summary: '支持文生图、图生图和最多 16 张参考图。',
    defaultResolution: '1k',
    resolutions: resolution('1K', '2K', '4K'),
    maxImages: 10,
    maxReferences: 16,
    sourcePrices: { '1k': 0.0085, '2k': 0.014, '4k': 0.021 },
  },
  'gpt-image-2-ext': {
    summary: 'GPT-Image-2 兼容别名，参数与计价一致。',
    defaultResolution: '1k',
    resolutions: resolution('1K', '2K', '4K'),
    maxImages: 10,
    maxReferences: 16,
    sourcePrices: { '1k': 0.0085, '2k': 0.014, '4k': 0.021 },
  },
  'gpt-image-2-official': {
    summary: 'OpenAI 官方通道，按实际输入与图像输出 Token 结算。',
    defaultResolution: '1k',
    resolutions: resolution('1K', '2K', '4K'),
    qualities: quality('Auto', 'Low', 'Medium', 'High'),
    defaultQuality: 'auto',
    maxImages: 4,
    maxReferences: 16,
    supportsOutputFormat: true,
    sourcePrices: flat(0.004792),
  },
  'grok-imagine-1.5-apimart': {
    summary: 'Grok Imagine 1.5，支持生成与参考图编辑。',
    sizeField: 'aspect_ratio',
    maxImages: 10,
    maxReferences: 5,
    sourcePrices: flat(0.015),
  },
  'grok-imagine-2.0-ext': {
    summary: 'Grok Imagine 2.0 扩展线路，支持一次生成 1–12 张。',
    sizeField: 'aspect_ratio',
    maxImages: 12,
    maxReferences: 0,
    sourcePrices: flat(0.08),
  },
  'grok-imagine-image': {
    summary: 'Grok 官方图像模型，支持 1K / 2K 和多图参考。',
    defaultResolution: '1k',
    resolutions: resolution('1K', '2K'),
    sizeField: 'aspect_ratio',
    maxImages: 10,
    maxReferences: 5,
    sourcePrices: { '1k': 0.016, '2k': 0.016 },
  },
  'grok-imagine-image-2.0': {
    summary: 'Grok 2.0 官方图像模型，可选清晰度与质量。',
    defaultResolution: '1k',
    resolutions: resolution('1K', '2K'),
    sizeField: 'aspect_ratio',
    qualities: quality('Low', 'Medium'),
    defaultQuality: 'medium',
    maxImages: 10,
    maxReferences: 3,
    sourcePrices: {
      '1k@low': 0.032,
      '1k@medium': 0.048,
      '2k@low': 0.048,
      '2k@medium': 0.064,
    },
  },
  'grok-imagine-image-quality': {
    summary: 'Grok 高质量图像线路，支持 1K / 2K。',
    defaultResolution: '1k',
    resolutions: resolution('1K', '2K'),
    sizeField: 'aspect_ratio',
    maxImages: 10,
    maxReferences: 3,
    sourcePrices: { '1k': 0.04, '2k': 0.056 },
  },
  'imagen-4.0-apimart': {
    summary: 'Imagen 4，适合写实、产品与商业视觉。',
    maxImages: 4,
    maxReferences: 0,
    supportsOutputFormat: true,
    sourcePrices: flat(0.04),
  },
  'qwen-image-2.0': {
    summary: '通义图像标准版，支持中英文提示词。',
    defaultResolution: '1k',
    resolutions: resolution('1K', '2K'),
    maxImages: 6,
    maxReferences: 3,
    supportsNegativePrompt: true,
    sourcePrices: flat(0.02),
  },
  'qwen-image-2.0-pro': {
    summary: '通义图像 Pro，文字排版与写实细节更强。',
    defaultResolution: '1k',
    resolutions: resolution('1K', '2K'),
    maxImages: 6,
    maxReferences: 3,
    supportsNegativePrompt: true,
    sourcePrices: flat(0.05),
  },
  'qwen-image-3.0': {
    summary: '通义图像 3.0 标准版，1K / 2K 同价。',
    defaultResolution: '1k',
    resolutions: resolution('1K', '2K'),
    maxImages: 6,
    maxReferences: 3,
    supportsNegativePrompt: true,
    supportsPromptExtend: true,
    sourcePrices: { '1k': 0.0205712, '2k': 0.0205712 },
  },
  'qwen-image-3.0-pro': {
    summary: '通义图像 3.0 Pro，2K 按双档计费。',
    defaultResolution: '1k',
    resolutions: resolution('1K', '2K'),
    maxImages: 6,
    maxReferences: 3,
    supportsNegativePrompt: true,
    supportsPromptExtend: true,
    sourcePrices: { '1k': 0.0285712, '2k': 0.0571432 },
  },
  'seedream-4.0': {
    summary: 'Seedream 4.0，支持 1K / 2K 与多图参考。',
    defaultResolution: '2k',
    resolutions: resolution('1K', '2K'),
    maxImages: 4,
    maxReferences: 10,
    supportsWatermark: true,
    supportsSeed: true,
    sourcePrices: flat(0.0182),
  },
  'seedream-4.5': {
    summary: 'Seedream 4.5，支持 2K / 4K 高清输出。',
    defaultResolution: '2k',
    resolutions: resolution('2K', '4K'),
    maxImages: 4,
    maxReferences: 10,
    supportsWatermark: true,
    supportsSeed: true,
    sourcePrices: flat(0.0228),
  },
  'seedream-5-0-lite': {
    summary: 'Seedream 5 Lite，支持 2K / 3K 和连续图像。',
    defaultResolution: '2k',
    resolutions: resolution('2K', '3K'),
    maxImages: 12,
    maxReferences: 10,
    supportsOutputFormat: true,
    supportsWatermark: true,
    supportsSeed: true,
    supportsSequential: true,
    sourcePrices: flat(0.0228),
  },
  'seedream-5-0-pro': {
    summary: 'Seedream 5 Pro，1K / 1.5K 同价，2K 双档。',
    defaultResolution: '1.5k',
    resolutions: resolution('1K', '1.5K', '2K'),
    maxImages: 1,
    maxReferences: 10,
    supportsOutputFormat: true,
    supportsWatermark: true,
    supportsSeed: true,
    sourcePrices: { '1k': 0.045, '1.5k': 0.045, '2k': 0.09 },
  },
  'wan2.7-image': {
    summary: 'Wan 2.7 标准版，支持编辑、连续生成和 2K。',
    defaultResolution: '2k',
    resolutions: resolution('1K', '2K'),
    maxImages: 12,
    maxReferences: 9,
    supportsNegativePrompt: true,
    supportsWatermark: true,
    supportsSeed: true,
    supportsThinkingMode: true,
    supportsSequential: true,
    sourcePrices: flat(0.2 / 7.3),
  },
  'wan2.7-image-pro': {
    summary: 'Wan 2.7 Pro，文生图最高 4K，编辑最高 2K。',
    defaultResolution: '2k',
    resolutions: resolution('1K', '2K', '4K'),
    maxImages: 12,
    maxReferences: 9,
    supportsNegativePrompt: true,
    supportsWatermark: true,
    supportsSeed: true,
    supportsThinkingMode: true,
    supportsSequential: true,
    sourcePrices: flat(0.5 / 7.3),
  },
  'z-image-turbo': {
    summary: '轻量高速中文生图，固定单张，可选提示词增强。',
    defaultResolution: '1k',
    resolutions: resolution('1K', '2K'),
    maxImages: 1,
    maxReferences: 0,
    supportsPromptExtend: true,
    sourcePrices: { default: 0.01, prompt_extend: 0.02 },
  },
}

export const APIMART_IMAGE_MODELS = new Set(Object.keys(APIMART_MODEL_CONFIGS))

export function getImageModelConfig(
  model: string
): ImageModelConfig | undefined {
  return APIMART_MODEL_CONFIGS[model.toLowerCase().trim()]
}

export function getEstimatedImagePriceCNY(
  model: string,
  resolutionValue: string,
  qualityValue: string,
  promptExtend: boolean
): number | null {
  const config = getImageModelConfig(model)
  if (!config) return null
  const normalizedResolution = resolutionValue.toLowerCase()
  const normalizedQuality = qualityValue.toLowerCase()
  const candidates = [
    `${normalizedResolution}@${normalizedQuality}`,
    promptExtend ? 'prompt_extend' : '',
    normalizedResolution,
    'default',
  ]
  for (const key of candidates) {
    if (key && config.sourcePrices[key] !== undefined) {
      return config.sourcePrices[key] * 1.15 * 7.3
    }
  }
  return null
}
