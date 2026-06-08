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
import * as React from 'react'
import * as z from 'zod'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  CheckCircle2,
  CreditCard,
  Eye,
  Globe,
  Lock,
  MessageSquare,
  Receipt,
  ShieldAlert,
  Smartphone,
  Sparkles,
  UserCheck,
  Wallet,
  Code2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { RiskAcknowledgementDialog } from '@/components/risk-acknowledgement-dialog'
import { confirmPaymentCompliance } from '../api'
import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import { safeNumberFieldProps } from '../utils/numeric-field'
import { AmountDiscountVisualEditor } from './amount-discount-visual-editor'
import { AmountOptionsVisualEditor } from './amount-options-visual-editor'
import { CreemProductsVisualEditor } from './creem-products-visual-editor'
import { PaymentMethodsVisualEditor } from './payment-methods-visual-editor'
import {
  formatJsonForEditor,
  getJsonError,
  normalizeJsonForComparison,
  removeTrailingSlash,
} from './utils'
import { saveWaffoPancakeConfig } from './waffo-pancake-api'
import {
  WaffoPancakeSettingsSection,
  type WaffoPancakeBinding,
  type WaffoPancakeSettingsValues,
} from './waffo-pancake-settings-section'
import {
  type PayMethod,
  WaffoSettingsSection,
  type WaffoSettingsValues,
} from './waffo-settings-section'

const paymentSchema = z.object({
  PayAddress: z.string().refine((value) => {
    const trimmed = value.trim()
    if (!trimmed) return true
    return /^https?:\/\//.test(trimmed)
  }, 'Provide a valid callback URL starting with http:// or https://'),
  EpayId: z.string(),
  EpayKey: z.string(),
  Price: z.coerce.number().min(0),
  MinTopUp: z.coerce.number().min(0),
  CustomCallbackAddress: z.string().refine((value) => {
    const trimmed = value.trim()
    if (!trimmed) return true
    return /^https?:\/\//.test(trimmed)
  }, 'Provide a valid URL starting with http:// or https://'),
  PayMethods: z.string().superRefine((value, ctx) => {
    const error = getJsonError(value)
    if (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error,
      })
    }
  }),
  AmountOptions: z.string().superRefine((value, ctx) => {
    const error = getJsonError(value, (parsed) => Array.isArray(parsed))
    if (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error,
      })
    }
  }),
  AmountDiscount: z.string().superRefine((value, ctx) => {
    const error = getJsonError(
      value,
      (parsed) =>
        !!parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    )
    if (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error,
      })
    }
  }),
  StripeApiSecret: z.string(),
  StripeWebhookSecret: z.string(),
  StripePriceId: z.string(),
  StripeUnitPrice: z.coerce.number().min(0),
  StripeMinTopUp: z.coerce.number().min(0),
  StripePromotionCodesEnabled: z.boolean(),
  CreemApiKey: z.string(),
  CreemWebhookSecret: z.string(),
  CreemTestMode: z.boolean(),
  CreemProducts: z.string().superRefine((value, ctx) => {
    const error = getJsonError(value, (parsed) => Array.isArray(parsed))
    if (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error,
      })
    }
  }),
  XPayEnabled: z.boolean(),
  XPayApiBase: z.string().refine((value) => {
    const trimmed = value.trim()
    if (!trimmed) return true
    return /^https?:\/\//.test(trimmed)
  }, 'Provide a valid URL starting with http:// or https://'),
  XPayAppID: z.string(),
  XPayAppSecret: z.string(),
  XPayPaymentType: z.string(),
  XPayReturnURL: z.string().refine((value) => {
    const trimmed = value.trim()
    if (!trimmed) return true
    return /^https?:\/\//.test(trimmed)
  }, 'Provide a valid URL starting with http:// or https://'),
  XPayNotifyURL: z.string().refine((value) => {
    const trimmed = value.trim()
    if (!trimmed) return true
    return /^https?:\/\//.test(trimmed)
  }, 'Provide a valid URL starting with http:// or https://'),
  XPayUnitPrice: z.coerce.number().min(0),
  XPayMinTopUp: z.coerce.number().min(0.1),
  XPayGatewayPath: z.string(),
  XPayNotifySuccess: z.string(),
  MPayEnabled: z.boolean(),
  MPayApiBase: z.string().refine((value) => {
    const trimmed = value.trim()
    if (!trimmed) return true
    return /^https?:\/\//.test(trimmed)
  }, 'Provide a valid URL starting with http:// or https://'),
  MPayPid: z.string(),
  MPayKey: z.string(),
  MPayPaymentType: z.string(),
  MPayReturnURL: z.string().refine((value) => {
    const trimmed = value.trim()
    if (!trimmed) return true
    return /^https?:\/\//.test(trimmed)
  }, 'Provide a valid URL starting with http:// or https://'),
  MPayNotifyURL: z.string().refine((value) => {
    const trimmed = value.trim()
    if (!trimmed) return true
    return /^https?:\/\//.test(trimmed)
  }, 'Provide a valid URL starting with http:// or https://'),
  MPayUnitPrice: z.coerce.number().min(0),
  MPayMinTopUp: z.coerce.number().min(0.1),
  MPayNotifySuccess: z.string(),
  WaffoEnabled: z.boolean(),
  WaffoApiKey: z.string(),
  WaffoPrivateKey: z.string(),
  WaffoPublicCert: z.string(),
  WaffoSandboxPublicCert: z.string(),
  WaffoSandboxApiKey: z.string(),
  WaffoSandboxPrivateKey: z.string(),
  WaffoSandbox: z.boolean(),
  WaffoMerchantId: z.string(),
  WaffoCurrency: z.string(),
  WaffoUnitPrice: z.coerce.number().min(0),
  WaffoMinTopUp: z.coerce.number().min(1),
  WaffoNotifyUrl: z.string(),
  WaffoReturnUrl: z.string(),
  WaffoPancakeMerchantID: z.string(),
  WaffoPancakePrivateKey: z.string(),
  WaffoPancakeReturnURL: z.string(),
})

type PaymentFormValues = z.infer<typeof paymentSchema>
type WaffoFormFieldValues = Omit<WaffoSettingsValues, 'WaffoPayMethods'>
type PaymentBaseFormValues = Omit<
  PaymentFormValues,
  keyof WaffoFormFieldValues | keyof WaffoPancakeSettingsValues
>

const CURRENT_COMPLIANCE_TERMS_VERSION = 'v1'

type PaymentComplianceDefaults = {
  confirmed: boolean
  termsVersion: string
  confirmedAt: number
  confirmedBy: number
}

type PaymentSettingsSectionProps = {
  defaultValues: PaymentBaseFormValues
  waffoDefaultValues: WaffoSettingsValues
  waffoPancakeDefaultValues: WaffoPancakeSettingsValues
  waffoPancakeProvisionedStoreID?: string
  waffoPancakeProvisionedProductID?: string
  complianceDefaults: PaymentComplianceDefaults
}

function parseWaffoPayMethods(value: string): PayMethod[] {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function PaymentSettingsSection({
  defaultValues,
  waffoDefaultValues,
  waffoPancakeDefaultValues,
  waffoPancakeProvisionedStoreID,
  waffoPancakeProvisionedProductID,
  complianceDefaults,
}: PaymentSettingsSectionProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const updateOption = useUpdateOption()
  const initialFormValues = React.useMemo<PaymentFormValues>(
    () => ({
      ...defaultValues,
      ...waffoDefaultValues,
      ...waffoPancakeDefaultValues,
    }),
    [defaultValues, waffoDefaultValues, waffoPancakeDefaultValues]
  )
  const initialRef = React.useRef(initialFormValues)
  const defaultsSignature = React.useMemo(
    () => JSON.stringify(initialFormValues),
    [initialFormValues]
  )

  const [payMethodsVisualMode, setPayMethodsVisualMode] = React.useState(true)
  const [amountOptionsVisualMode, setAmountOptionsVisualMode] =
    React.useState(true)
  const [amountDiscountVisualMode, setAmountDiscountVisualMode] =
    React.useState(true)
  const [creemProductsVisualMode, setCreemProductsVisualMode] =
    React.useState(true)
  const [showComplianceDialog, setShowComplianceDialog] = React.useState(false)
  const [waffoPayMethods, setWaffoPayMethods] = React.useState<PayMethod[]>(
    () => parseWaffoPayMethods(waffoDefaultValues.WaffoPayMethods)
  )
  const [waffoPancakeSelection, setWaffoPancakeSelection] =
    React.useState<WaffoPancakeBinding>({
      storeID: waffoPancakeProvisionedStoreID ?? '',
      productID: waffoPancakeProvisionedProductID ?? '',
    })
  const [waffoPancakeSavedBinding, setWaffoPancakeSavedBinding] =
    React.useState<WaffoPancakeBinding>({
      storeID: waffoPancakeProvisionedStoreID ?? '',
      productID: waffoPancakeProvisionedProductID ?? '',
    })

  React.useEffect(() => {
    setWaffoPayMethods(parseWaffoPayMethods(waffoDefaultValues.WaffoPayMethods))
  }, [waffoDefaultValues.WaffoPayMethods])

  React.useEffect(() => {
    const nextBinding = {
      storeID: waffoPancakeProvisionedStoreID ?? '',
      productID: waffoPancakeProvisionedProductID ?? '',
    }
    setWaffoPancakeSelection(nextBinding)
    setWaffoPancakeSavedBinding(nextBinding)
  }, [waffoPancakeProvisionedProductID, waffoPancakeProvisionedStoreID])

  const complianceStatements = React.useMemo(
    () => [
      t(
        'You have legally obtained authorization for the connected model APIs, accounts, keys, and quotas.'
      ),
      t(
        'You commit to using upstream APIs, accounts, keys, quotas, and service capabilities only within the scope of lawful authorization obtained from upstream service providers, model service providers, or relevant rights holders, and will not conduct unauthorized resale, trafficking, distribution, or other non-compliant commercialization.'
      ),
      t(
        'If you provide generative AI services to the public in mainland China, you will fulfill legal obligations including filing, security assessment, content safety, complaint handling, generated content labeling, log retention, and personal information protection.'
      ),
      t(
        'You commit not to use this system to implement, assist with, or indirectly implement acts that violate applicable laws and regulations, regulatory requirements, platform rules, public interests, or the lawful rights and interests of third parties.'
      ),
      t(
        'You understand and independently bear legal responsibility arising from deployment, operation, and charging behavior.'
      ),
      t(
        'You understand this compliance reminder is only for risk notice and does not constitute legal advice, a compliance review conclusion, or a guarantee of the legality of your use of this system; you should consult professional legal or compliance advisors based on your actual business scenario.'
      ),
    ],
    [t]
  )

  const complianceRequiredText = t(
    'I have read and understood the above compliance reminder, acknowledge the related legal risks, and confirm that I bear legal responsibility arising from deployment, operation, and charging behavior.'
  )
  const complianceRequiredTextParts = React.useMemo(
    () => [
      {
        type: 'input' as const,
        text: t('I have read and understood the above compliance reminder'),
      },
      { type: 'static' as const, text: t('，') },
      {
        type: 'input' as const,
        text: t('acknowledge the related legal risks'),
      },
      { type: 'static' as const, text: t('，and ') },
      {
        type: 'input' as const,
        text: t(
          'confirm that I bear legal responsibility arising from deployment'
        ),
      },
      { type: 'static' as const, text: t('、') },
      {
        type: 'input' as const,
        text: t('operation and charging behavior'),
      },
    ],
    [t]
  )
  const complianceConfirmed =
    complianceDefaults.confirmed &&
    complianceDefaults.termsVersion === CURRENT_COMPLIANCE_TERMS_VERSION

  const confirmComplianceMutation = useMutation({
    mutationFn: confirmPaymentCompliance,
    onSuccess: (data) => {
      if (data.success) {
        toast.success(t('Compliance confirmed successfully'))
        setShowComplianceDialog(false)
        queryClient.invalidateQueries({ queryKey: ['system-options'] })
      } else {
        toast.error(data.message || t('Failed to confirm compliance'))
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || t('Failed to confirm compliance'))
    },
  })

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema) as Resolver<PaymentFormValues>,
    mode: 'onChange', // Enable real-time validation
    defaultValues: {
      ...initialFormValues,
      PayMethods: formatJsonForEditor(initialFormValues.PayMethods),
      AmountOptions: formatJsonForEditor(initialFormValues.AmountOptions),
      AmountDiscount: formatJsonForEditor(initialFormValues.AmountDiscount),
      CreemProducts: formatJsonForEditor(initialFormValues.CreemProducts),
    },
  })

  const { isSubmitting } = form.formState

  const setPaymentValue = React.useCallback(
    (
      key: keyof PaymentFormValues,
      value: PaymentFormValues[keyof PaymentFormValues]
    ) => {
      form.setValue(
        key as Parameters<typeof form.setValue>[0],
        value as Parameters<typeof form.setValue>[1],
        {
          shouldDirty: true,
          shouldValidate: true,
        }
      )
    },
    [form]
  )

  const setWaffoValue = React.useCallback(
    <K extends keyof WaffoFormFieldValues>(
      key: K,
      value: WaffoFormFieldValues[K]
    ) => {
      setPaymentValue(
        key as keyof PaymentFormValues,
        value as PaymentFormValues[keyof PaymentFormValues]
      )
    },
    [setPaymentValue]
  )

  const setWaffoPancakeValue = React.useCallback(
    <K extends keyof WaffoPancakeSettingsValues>(
      key: K,
      value: WaffoPancakeSettingsValues[K]
    ) => {
      setPaymentValue(
        key as keyof PaymentFormValues,
        value as PaymentFormValues[keyof PaymentFormValues]
      )
    },
    [setPaymentValue]
  )

  React.useEffect(() => {
    const parsedDefaults = JSON.parse(defaultsSignature) as PaymentFormValues
    initialRef.current = parsedDefaults
    form.reset({
      ...parsedDefaults,
      PayMethods: formatJsonForEditor(parsedDefaults.PayMethods),
      AmountOptions: formatJsonForEditor(parsedDefaults.AmountOptions),
      AmountDiscount: formatJsonForEditor(parsedDefaults.AmountDiscount),
      CreemProducts: formatJsonForEditor(parsedDefaults.CreemProducts),
    })
  }, [defaultsSignature, form])

  const onSubmit = async (values: PaymentFormValues) => {
    const sanitized = {
      PayAddress: removeTrailingSlash(values.PayAddress),
      EpayId: values.EpayId.trim(),
      EpayKey: values.EpayKey.trim(),
      Price: values.Price,
      MinTopUp: values.MinTopUp,
      CustomCallbackAddress: removeTrailingSlash(values.CustomCallbackAddress),
      PayMethods: values.PayMethods.trim(),
      AmountOptions: values.AmountOptions.trim(),
      AmountDiscount: values.AmountDiscount.trim(),
      StripeApiSecret: values.StripeApiSecret.trim(),
      StripeWebhookSecret: values.StripeWebhookSecret.trim(),
      StripePriceId: values.StripePriceId.trim(),
      StripeUnitPrice: values.StripeUnitPrice,
      StripeMinTopUp: values.StripeMinTopUp,
      StripePromotionCodesEnabled: values.StripePromotionCodesEnabled,
      CreemApiKey: values.CreemApiKey.trim(),
      CreemWebhookSecret: values.CreemWebhookSecret.trim(),
      CreemTestMode: values.CreemTestMode,
      CreemProducts: values.CreemProducts.trim(),
      XPayEnabled: values.XPayEnabled,
      XPayApiBase: removeTrailingSlash(values.XPayApiBase.trim()),
      XPayAppID: values.XPayAppID.trim(),
      XPayAppSecret: values.XPayAppSecret.trim(),
      XPayPaymentType: values.XPayPaymentType.trim() || 'DMF',
      XPayReturnURL: removeTrailingSlash(values.XPayReturnURL.trim()),
      XPayNotifyURL: removeTrailingSlash(values.XPayNotifyURL.trim()),
      XPayUnitPrice: values.XPayUnitPrice,
      XPayMinTopUp: values.XPayMinTopUp,
      XPayGatewayPath: values.XPayGatewayPath.trim() || '/alipay/precreate',
      XPayNotifySuccess: values.XPayNotifySuccess.trim() || 'OK',
      MPayEnabled: values.MPayEnabled,
      MPayApiBase: removeTrailingSlash(values.MPayApiBase.trim()),
      MPayPid: values.MPayPid.trim(),
      MPayKey: values.MPayKey.trim(),
      MPayPaymentType: values.MPayPaymentType.trim() || 'alipay',
      MPayReturnURL: removeTrailingSlash(values.MPayReturnURL.trim()),
      MPayNotifyURL: removeTrailingSlash(values.MPayNotifyURL.trim()),
      MPayUnitPrice: values.MPayUnitPrice,
      MPayMinTopUp: values.MPayMinTopUp,
      MPayNotifySuccess: values.MPayNotifySuccess.trim() || 'success',
      WaffoEnabled: values.WaffoEnabled,
      WaffoSandbox: values.WaffoSandbox,
      WaffoMerchantId: values.WaffoMerchantId.trim(),
      WaffoCurrency: values.WaffoCurrency.trim() || 'USD',
      WaffoUnitPrice: values.WaffoUnitPrice,
      WaffoMinTopUp: values.WaffoMinTopUp,
      WaffoNotifyUrl: values.WaffoNotifyUrl.trim(),
      WaffoReturnUrl: values.WaffoReturnUrl.trim(),
      WaffoPublicCert: values.WaffoPublicCert.trim(),
      WaffoSandboxPublicCert: values.WaffoSandboxPublicCert.trim(),
      WaffoApiKey: values.WaffoApiKey.trim(),
      WaffoPrivateKey: values.WaffoPrivateKey.trim(),
      WaffoSandboxApiKey: values.WaffoSandboxApiKey.trim(),
      WaffoSandboxPrivateKey: values.WaffoSandboxPrivateKey.trim(),
      WaffoPayMethods: JSON.stringify(waffoPayMethods),
      WaffoPancakeMerchantID: values.WaffoPancakeMerchantID.trim(),
      WaffoPancakePrivateKey: values.WaffoPancakePrivateKey.trim(),
      WaffoPancakeReturnURL: removeTrailingSlash(
        values.WaffoPancakeReturnURL.trim()
      ),
    }

    const initial = {
      PayAddress: removeTrailingSlash(initialRef.current.PayAddress),
      EpayId: initialRef.current.EpayId.trim(),
      EpayKey: initialRef.current.EpayKey.trim(),
      Price: initialRef.current.Price,
      MinTopUp: initialRef.current.MinTopUp,
      CustomCallbackAddress: removeTrailingSlash(
        initialRef.current.CustomCallbackAddress
      ),
      PayMethods: initialRef.current.PayMethods.trim(),
      AmountOptions: initialRef.current.AmountOptions.trim(),
      AmountDiscount: initialRef.current.AmountDiscount.trim(),
      StripeApiSecret: initialRef.current.StripeApiSecret.trim(),
      StripeWebhookSecret: initialRef.current.StripeWebhookSecret.trim(),
      StripePriceId: initialRef.current.StripePriceId.trim(),
      StripeUnitPrice: initialRef.current.StripeUnitPrice,
      StripeMinTopUp: initialRef.current.StripeMinTopUp,
      StripePromotionCodesEnabled:
        initialRef.current.StripePromotionCodesEnabled,
      CreemApiKey: initialRef.current.CreemApiKey.trim(),
      CreemWebhookSecret: initialRef.current.CreemWebhookSecret.trim(),
      CreemTestMode: initialRef.current.CreemTestMode,
      CreemProducts: initialRef.current.CreemProducts.trim(),
      XPayEnabled: initialRef.current.XPayEnabled,
      XPayApiBase: removeTrailingSlash(initialRef.current.XPayApiBase),
      XPayAppID: initialRef.current.XPayAppID.trim(),
      XPayAppSecret: initialRef.current.XPayAppSecret.trim(),
      XPayPaymentType: initialRef.current.XPayPaymentType.trim() || 'DMF',
      XPayReturnURL: removeTrailingSlash(initialRef.current.XPayReturnURL),
      XPayNotifyURL: removeTrailingSlash(initialRef.current.XPayNotifyURL),
      XPayUnitPrice: initialRef.current.XPayUnitPrice,
      XPayMinTopUp: initialRef.current.XPayMinTopUp,
      XPayGatewayPath:
        initialRef.current.XPayGatewayPath.trim() || '/alipay/precreate',
      XPayNotifySuccess: initialRef.current.XPayNotifySuccess.trim() || 'OK',
      MPayEnabled: initialRef.current.MPayEnabled,
      MPayApiBase: removeTrailingSlash(initialRef.current.MPayApiBase),
      MPayPid: initialRef.current.MPayPid.trim(),
      MPayKey: initialRef.current.MPayKey.trim(),
      MPayPaymentType: initialRef.current.MPayPaymentType.trim() || 'alipay',
      MPayReturnURL: removeTrailingSlash(initialRef.current.MPayReturnURL),
      MPayNotifyURL: removeTrailingSlash(initialRef.current.MPayNotifyURL),
      MPayUnitPrice: initialRef.current.MPayUnitPrice,
      MPayMinTopUp: initialRef.current.MPayMinTopUp,
      MPayNotifySuccess:
        initialRef.current.MPayNotifySuccess.trim() || 'success',
      WaffoEnabled: initialRef.current.WaffoEnabled,
      WaffoSandbox: initialRef.current.WaffoSandbox,
      WaffoMerchantId: initialRef.current.WaffoMerchantId.trim(),
      WaffoCurrency: initialRef.current.WaffoCurrency.trim() || 'USD',
      WaffoUnitPrice: initialRef.current.WaffoUnitPrice,
      WaffoMinTopUp: initialRef.current.WaffoMinTopUp,
      WaffoNotifyUrl: initialRef.current.WaffoNotifyUrl.trim(),
      WaffoReturnUrl: initialRef.current.WaffoReturnUrl.trim(),
      WaffoPublicCert: initialRef.current.WaffoPublicCert.trim(),
      WaffoSandboxPublicCert: initialRef.current.WaffoSandboxPublicCert.trim(),
      WaffoApiKey: initialRef.current.WaffoApiKey.trim(),
      WaffoPrivateKey: initialRef.current.WaffoPrivateKey.trim(),
      WaffoSandboxApiKey: initialRef.current.WaffoSandboxApiKey.trim(),
      WaffoSandboxPrivateKey: initialRef.current.WaffoSandboxPrivateKey.trim(),
      WaffoPayMethods: JSON.stringify(
        parseWaffoPayMethods(waffoDefaultValues.WaffoPayMethods)
      ),
      WaffoPancakeMerchantID: initialRef.current.WaffoPancakeMerchantID.trim(),
      WaffoPancakePrivateKey: initialRef.current.WaffoPancakePrivateKey.trim(),
      WaffoPancakeReturnURL: removeTrailingSlash(
        initialRef.current.WaffoPancakeReturnURL.trim()
      ),
    }

    const updates: Array<{ key: string; value: string | number | boolean }> = []

    if (sanitized.PayAddress !== initial.PayAddress) {
      updates.push({ key: 'PayAddress', value: sanitized.PayAddress })
    }

    if (sanitized.EpayId !== initial.EpayId) {
      updates.push({ key: 'EpayId', value: sanitized.EpayId })
    }

    if (sanitized.EpayKey && sanitized.EpayKey !== initial.EpayKey) {
      updates.push({ key: 'EpayKey', value: sanitized.EpayKey })
    }

    if (sanitized.Price !== initial.Price) {
      updates.push({ key: 'Price', value: sanitized.Price })
    }

    if (sanitized.MinTopUp !== initial.MinTopUp) {
      updates.push({ key: 'MinTopUp', value: sanitized.MinTopUp })
    }

    if (sanitized.CustomCallbackAddress !== initial.CustomCallbackAddress) {
      updates.push({
        key: 'CustomCallbackAddress',
        value: sanitized.CustomCallbackAddress,
      })
    }

    if (
      normalizeJsonForComparison(sanitized.PayMethods) !==
      normalizeJsonForComparison(initial.PayMethods)
    ) {
      updates.push({ key: 'PayMethods', value: sanitized.PayMethods })
    }

    if (
      normalizeJsonForComparison(sanitized.AmountOptions) !==
      normalizeJsonForComparison(initial.AmountOptions)
    ) {
      updates.push({
        key: 'payment_setting.amount_options',
        value: sanitized.AmountOptions,
      })
    }

    if (
      normalizeJsonForComparison(sanitized.AmountDiscount) !==
      normalizeJsonForComparison(initial.AmountDiscount)
    ) {
      updates.push({
        key: 'payment_setting.amount_discount',
        value: sanitized.AmountDiscount,
      })
    }

    if (
      sanitized.StripeApiSecret &&
      sanitized.StripeApiSecret !== initial.StripeApiSecret
    ) {
      updates.push({ key: 'StripeApiSecret', value: sanitized.StripeApiSecret })
    }

    if (
      sanitized.StripeWebhookSecret &&
      sanitized.StripeWebhookSecret !== initial.StripeWebhookSecret
    ) {
      updates.push({
        key: 'StripeWebhookSecret',
        value: sanitized.StripeWebhookSecret,
      })
    }

    if (sanitized.StripePriceId !== initial.StripePriceId) {
      updates.push({ key: 'StripePriceId', value: sanitized.StripePriceId })
    }

    if (sanitized.StripeUnitPrice !== initial.StripeUnitPrice) {
      updates.push({ key: 'StripeUnitPrice', value: sanitized.StripeUnitPrice })
    }

    if (sanitized.StripeMinTopUp !== initial.StripeMinTopUp) {
      updates.push({ key: 'StripeMinTopUp', value: sanitized.StripeMinTopUp })
    }

    if (
      sanitized.StripePromotionCodesEnabled !==
      initial.StripePromotionCodesEnabled
    ) {
      updates.push({
        key: 'StripePromotionCodesEnabled',
        value: sanitized.StripePromotionCodesEnabled,
      })
    }

    if (
      sanitized.CreemApiKey &&
      sanitized.CreemApiKey !== initial.CreemApiKey
    ) {
      updates.push({ key: 'CreemApiKey', value: sanitized.CreemApiKey })
    }

    if (
      sanitized.CreemWebhookSecret &&
      sanitized.CreemWebhookSecret !== initial.CreemWebhookSecret
    ) {
      updates.push({
        key: 'CreemWebhookSecret',
        value: sanitized.CreemWebhookSecret,
      })
    }

    if (sanitized.CreemTestMode !== initial.CreemTestMode) {
      updates.push({ key: 'CreemTestMode', value: sanitized.CreemTestMode })
    }

    if (
      normalizeJsonForComparison(sanitized.CreemProducts) !==
      normalizeJsonForComparison(initial.CreemProducts)
    ) {
      updates.push({ key: 'CreemProducts', value: sanitized.CreemProducts })
    }

    if (sanitized.XPayEnabled !== initial.XPayEnabled) {
      updates.push({ key: 'XPayEnabled', value: sanitized.XPayEnabled })
    }

    if (sanitized.XPayApiBase !== initial.XPayApiBase) {
      updates.push({ key: 'XPayApiBase', value: sanitized.XPayApiBase })
    }

    if (sanitized.XPayAppID !== initial.XPayAppID) {
      updates.push({ key: 'XPayAppID', value: sanitized.XPayAppID })
    }

    if (sanitized.XPayAppSecret) {
      updates.push({ key: 'XPayAppSecret', value: sanitized.XPayAppSecret })
    }

    if (sanitized.XPayPaymentType !== initial.XPayPaymentType) {
      updates.push({ key: 'XPayPaymentType', value: sanitized.XPayPaymentType })
    }

    if (sanitized.XPayReturnURL !== initial.XPayReturnURL) {
      updates.push({ key: 'XPayReturnURL', value: sanitized.XPayReturnURL })
    }

    if (sanitized.XPayNotifyURL !== initial.XPayNotifyURL) {
      updates.push({ key: 'XPayNotifyURL', value: sanitized.XPayNotifyURL })
    }

    if (sanitized.XPayUnitPrice !== initial.XPayUnitPrice) {
      updates.push({ key: 'XPayUnitPrice', value: sanitized.XPayUnitPrice })
    }

    if (sanitized.XPayMinTopUp !== initial.XPayMinTopUp) {
      updates.push({ key: 'XPayMinTopUp', value: sanitized.XPayMinTopUp })
    }

    if (sanitized.XPayGatewayPath !== initial.XPayGatewayPath) {
      updates.push({ key: 'XPayGatewayPath', value: sanitized.XPayGatewayPath })
    }

    if (sanitized.XPayNotifySuccess !== initial.XPayNotifySuccess) {
      updates.push({
        key: 'XPayNotifySuccess',
        value: sanitized.XPayNotifySuccess,
      })
    }

    if (sanitized.MPayEnabled !== initial.MPayEnabled) {
      updates.push({ key: 'MPayEnabled', value: sanitized.MPayEnabled })
    }

    if (sanitized.MPayApiBase !== initial.MPayApiBase) {
      updates.push({ key: 'MPayApiBase', value: sanitized.MPayApiBase })
    }

    if (sanitized.MPayPid !== initial.MPayPid) {
      updates.push({ key: 'MPayPid', value: sanitized.MPayPid })
    }

    if (sanitized.MPayKey) {
      updates.push({ key: 'MPayKey', value: sanitized.MPayKey })
    }

    if (sanitized.MPayPaymentType !== initial.MPayPaymentType) {
      updates.push({ key: 'MPayPaymentType', value: sanitized.MPayPaymentType })
    }

    if (sanitized.MPayReturnURL !== initial.MPayReturnURL) {
      updates.push({ key: 'MPayReturnURL', value: sanitized.MPayReturnURL })
    }

    if (sanitized.MPayNotifyURL !== initial.MPayNotifyURL) {
      updates.push({ key: 'MPayNotifyURL', value: sanitized.MPayNotifyURL })
    }

    if (sanitized.MPayUnitPrice !== initial.MPayUnitPrice) {
      updates.push({ key: 'MPayUnitPrice', value: sanitized.MPayUnitPrice })
    }

    if (sanitized.MPayMinTopUp !== initial.MPayMinTopUp) {
      updates.push({ key: 'MPayMinTopUp', value: sanitized.MPayMinTopUp })
    }

    if (sanitized.MPayNotifySuccess !== initial.MPayNotifySuccess) {
      updates.push({
        key: 'MPayNotifySuccess',
        value: sanitized.MPayNotifySuccess,
      })
    }

    if (sanitized.WaffoEnabled !== initial.WaffoEnabled) {
      updates.push({ key: 'WaffoEnabled', value: sanitized.WaffoEnabled })
    }

    if (sanitized.WaffoSandbox !== initial.WaffoSandbox) {
      updates.push({ key: 'WaffoSandbox', value: sanitized.WaffoSandbox })
    }

    if (sanitized.WaffoMerchantId !== initial.WaffoMerchantId) {
      updates.push({ key: 'WaffoMerchantId', value: sanitized.WaffoMerchantId })
    }

    if (sanitized.WaffoCurrency !== initial.WaffoCurrency) {
      updates.push({ key: 'WaffoCurrency', value: sanitized.WaffoCurrency })
    }

    if (sanitized.WaffoUnitPrice !== initial.WaffoUnitPrice) {
      updates.push({ key: 'WaffoUnitPrice', value: sanitized.WaffoUnitPrice })
    }

    if (sanitized.WaffoMinTopUp !== initial.WaffoMinTopUp) {
      updates.push({ key: 'WaffoMinTopUp', value: sanitized.WaffoMinTopUp })
    }

    if (sanitized.WaffoNotifyUrl !== initial.WaffoNotifyUrl) {
      updates.push({ key: 'WaffoNotifyUrl', value: sanitized.WaffoNotifyUrl })
    }

    if (sanitized.WaffoReturnUrl !== initial.WaffoReturnUrl) {
      updates.push({ key: 'WaffoReturnUrl', value: sanitized.WaffoReturnUrl })
    }

    if (sanitized.WaffoPublicCert !== initial.WaffoPublicCert) {
      updates.push({ key: 'WaffoPublicCert', value: sanitized.WaffoPublicCert })
    }

    if (sanitized.WaffoSandboxPublicCert !== initial.WaffoSandboxPublicCert) {
      updates.push({
        key: 'WaffoSandboxPublicCert',
        value: sanitized.WaffoSandboxPublicCert,
      })
    }

    if (sanitized.WaffoApiKey) {
      updates.push({ key: 'WaffoApiKey', value: sanitized.WaffoApiKey })
    }

    if (sanitized.WaffoPrivateKey) {
      updates.push({ key: 'WaffoPrivateKey', value: sanitized.WaffoPrivateKey })
    }

    if (sanitized.WaffoSandboxApiKey) {
      updates.push({
        key: 'WaffoSandboxApiKey',
        value: sanitized.WaffoSandboxApiKey,
      })
    }

    if (sanitized.WaffoSandboxPrivateKey) {
      updates.push({
        key: 'WaffoSandboxPrivateKey',
        value: sanitized.WaffoSandboxPrivateKey,
      })
    }

    if (
      normalizeJsonForComparison(sanitized.WaffoPayMethods) !==
      normalizeJsonForComparison(initial.WaffoPayMethods)
    ) {
      updates.push({ key: 'WaffoPayMethods', value: sanitized.WaffoPayMethods })
    }

    const hasWaffoPancakeChanges =
      sanitized.WaffoPancakeMerchantID !== initial.WaffoPancakeMerchantID ||
      sanitized.WaffoPancakePrivateKey.length > 0 ||
      sanitized.WaffoPancakeReturnURL !== initial.WaffoPancakeReturnURL ||
      waffoPancakeSelection.storeID !== waffoPancakeSavedBinding.storeID ||
      waffoPancakeSelection.productID !== waffoPancakeSavedBinding.productID

    if (updates.length === 0 && !hasWaffoPancakeChanges) {
      toast.info(t('No changes to save'))
      return
    }

    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }

    if (!hasWaffoPancakeChanges) {
      return
    }

    if (!sanitized.WaffoPancakeMerchantID) {
      toast.error(t('Merchant ID is required'))
      return
    }

    if (!waffoPancakeSelection.storeID || !waffoPancakeSelection.productID) {
      toast.error(t('Pick or create both a store and a product before saving.'))
      return
    }

    try {
      const body = await saveWaffoPancakeConfig({
        merchantID: sanitized.WaffoPancakeMerchantID,
        privateKey: sanitized.WaffoPancakePrivateKey,
        returnURL: sanitized.WaffoPancakeReturnURL,
        storeID: waffoPancakeSelection.storeID,
        productID: waffoPancakeSelection.productID,
      })

      if (
        body?.message === 'success' &&
        typeof body.data === 'object' &&
        body.data
      ) {
        const saved = body.data as { product_id: string; store_id: string }
        const savedBinding = {
          storeID: saved.store_id,
          productID: saved.product_id,
        }
        setWaffoPancakeSavedBinding(savedBinding)
        setWaffoPancakeSelection(savedBinding)
        queryClient.invalidateQueries({ queryKey: ['system-options'] })
        toast.success(t('Waffo Pancake settings saved'))
        return
      }

      const reason = typeof body?.data === 'string' ? body.data : undefined
      toast.error(
        reason
          ? `${t('Waffo Pancake save failed')}: ${reason}`
          : t('Waffo Pancake save failed')
      )
    } catch (error) {
      toast.error(
        `${t('Waffo Pancake save failed')}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  const currentFormValues = form.watch()
  const waffoValues: WaffoSettingsValues = {
    WaffoEnabled: currentFormValues.WaffoEnabled,
    WaffoApiKey: currentFormValues.WaffoApiKey,
    WaffoPrivateKey: currentFormValues.WaffoPrivateKey,
    WaffoPublicCert: currentFormValues.WaffoPublicCert,
    WaffoSandboxPublicCert: currentFormValues.WaffoSandboxPublicCert,
    WaffoSandboxApiKey: currentFormValues.WaffoSandboxApiKey,
    WaffoSandboxPrivateKey: currentFormValues.WaffoSandboxPrivateKey,
    WaffoSandbox: currentFormValues.WaffoSandbox,
    WaffoMerchantId: currentFormValues.WaffoMerchantId,
    WaffoCurrency: currentFormValues.WaffoCurrency,
    WaffoUnitPrice: currentFormValues.WaffoUnitPrice,
    WaffoMinTopUp: currentFormValues.WaffoMinTopUp,
    WaffoNotifyUrl: currentFormValues.WaffoNotifyUrl,
    WaffoReturnUrl: currentFormValues.WaffoReturnUrl,
    WaffoPayMethods: JSON.stringify(waffoPayMethods),
  }
  const waffoPancakeValues: WaffoPancakeSettingsValues = {
    WaffoPancakeMerchantID: currentFormValues.WaffoPancakeMerchantID,
    WaffoPancakePrivateKey: currentFormValues.WaffoPancakePrivateKey,
    WaffoPancakeReturnURL: currentFormValues.WaffoPancakeReturnURL,
  }

  return (
    <SettingsSection title={t('Payment Gateway')}>
      {!complianceConfirmed ? (
        <Alert variant='destructive' className='mb-6'>
          <ShieldAlert className='h-4 w-4' />
          <AlertTitle>{t('Compliance confirmation required')}</AlertTitle>
          <AlertDescription>
            <div className='space-y-3'>
              <p>
                {t(
                  'Payment, redemption codes, subscription plans, and invitation rewards are locked until the root administrator confirms the compliance terms.'
                )}
              </p>
              <ol className='list-decimal space-y-1 pl-5'>
                {complianceStatements.map((statement) => (
                  <li key={statement}>{statement}</li>
                ))}
              </ol>
            </div>
          </AlertDescription>
          <AlertAction>
            <Button
              type='button'
              size='sm'
              variant='destructive'
              onClick={() => setShowComplianceDialog(true)}
            >
              {t('Confirm compliance')}
            </Button>
          </AlertAction>
        </Alert>
      ) : (
        <Alert className='mb-6'>
          <AlertTitle>{t('Compliance confirmed')}</AlertTitle>
          <AlertDescription>
            {t('Confirmed at {{time}} by user #{{userId}}', {
              time: complianceDefaults.confirmedAt
                ? new Date(
                    complianceDefaults.confirmedAt * 1000
                  ).toLocaleString()
                : '-',
              userId: complianceDefaults.confirmedBy || '-',
            })}
          </AlertDescription>
        </Alert>
      )}

      <RiskAcknowledgementDialog
        open={showComplianceDialog}
        onOpenChange={setShowComplianceDialog}
        title={t('Confirm compliance terms')}
        description={t(
          'This confirmation unlocks payment, redemption code, subscription plan, and invitation reward features. Please read the statements carefully.'
        )}
        items={complianceStatements}
        requiredText={complianceRequiredText}
        requiredTextParts={complianceRequiredTextParts}
        inputPrompt={t('Please type the following text to confirm:')}
        inputPlaceholder={t('Type the confirmation text here')}
        mismatchHint={t('The entered text does not match the required text.')}
        confirmText={t('Confirm and enable')}
        isLoading={confirmComplianceMutation.isPending}
        onConfirm={() => confirmComplianceMutation.mutate()}
      />

      <Form {...form}>
        <SettingsForm
          onSubmit={form.handleSubmit(onSubmit)}
          className={cn(
            'gap-y-8',
            !complianceConfirmed && 'pointer-events-none opacity-40'
          )}
          data-no-autosubmit='true'
        >
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending || isSubmitting}
            saveLabel='Save all settings'
          />

          {/* Gateway Card: General Settings */}
          <div className='rounded-xl border bg-gradient-to-br from-slate-50 to-slate-100 p-5 dark:from-slate-900 dark:to-slate-800'>
            <div className='mb-4 flex flex-wrap items-center gap-3 sm:flex-nowrap'>
              <div className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-white shadow-sm'>
                <Wallet className='size-5' />
              </div>
              <div className='min-w-0 flex-1'>
                <h3 className='text-lg font-semibold'>
                  {t('General Settings')}
                </h3>
                <p className='text-muted-foreground text-sm'>
                  {t('Shared configuration for all payment gateways')}
                </p>
              </div>
            </div>

            <div className='grid gap-6 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='Price'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Price (local currency / unit)')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        step='0.01'
                        min={0}
                        {...safeNumberFieldProps(field)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'How much to charge for each US dollar of balance (Epay)'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='MinTopUp'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Minimum top-up')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        step='0.01'
                        min={0}
                        {...safeNumberFieldProps(field)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Smallest amount users can recharge (Epay)')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='PayMethods'
              render={({ field }) => (
                <FormItem className='mt-4'>
                  <div className='mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                    <FormLabel>{t('Payment methods')}</FormLabel>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        setPayMethodsVisualMode(!payMethodsVisualMode)
                      }
                      className='w-full sm:w-auto'
                    >
                      {payMethodsVisualMode ? (
                        <>
                          <Code2 className='mr-2 h-3 w-3' />
                          {t('JSON Editor')}
                        </>
                      ) : (
                        <>
                          <Eye className='mr-2 h-3 w-3' />
                          {t('Visual Editor')}
                        </>
                      )}
                    </Button>
                  </div>
                  <FormControl>
                    {payMethodsVisualMode ? (
                      <PaymentMethodsVisualEditor
                        value={field.value}
                        onChange={field.onChange}
                      />
                    ) : (
                      <Textarea
                        rows={4}
                        placeholder={t(
                          '[{"name":"支付宝","type":"alipay","color":"#1677FF"}]'
                        )}
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    )}
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Configure available payment methods. Provide a JSON array.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='mt-4 grid gap-6 md:grid-cols-2 md:items-start'>
              <FormField
                control={form.control}
                name='AmountOptions'
                render={({ field }) => (
                  <FormItem>
                    <div className='mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                      <FormLabel>{t('Top-up amount options')}</FormLabel>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() =>
                          setAmountOptionsVisualMode(!amountOptionsVisualMode)
                        }
                        className='w-full sm:w-auto'
                      >
                        {amountOptionsVisualMode ? (
                          <>
                            <Code2 className='mr-2 h-3 w-3' />
                            {t('JSON Editor')}
                          </>
                        ) : (
                          <>
                            <Eye className='mr-2 h-3 w-3' />
                            {t('Visual Editor')}
                          </>
                        )}
                      </Button>
                    </div>
                    <FormControl>
                      {amountOptionsVisualMode ? (
                        <AmountOptionsVisualEditor
                          value={field.value}
                          onChange={field.onChange}
                        />
                      ) : (
                        <Textarea
                          rows={4}
                          placeholder='[10, 20, 50, 100]'
                          {...field}
                          onChange={(event) =>
                            field.onChange(event.target.value)
                          }
                        />
                      )}
                    </FormControl>
                    <FormDescription>
                      {t('Preset recharge amounts (JSON array)')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='AmountDiscount'
                render={({ field }) => (
                  <FormItem>
                    <div className='mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                      <FormLabel>{t('Amount discount')}</FormLabel>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() =>
                          setAmountDiscountVisualMode(!amountDiscountVisualMode)
                        }
                        className='w-full sm:w-auto'
                      >
                        {amountDiscountVisualMode ? (
                          <>
                            <Code2 className='mr-2 h-3 w-3' />
                            {t('JSON Editor')}
                          </>
                        ) : (
                          <>
                            <Eye className='mr-2 h-3 w-3' />
                            {t('Visual Editor')}
                          </>
                        )}
                      </Button>
                    </div>
                    <FormControl>
                      {amountDiscountVisualMode ? (
                        <AmountDiscountVisualEditor
                          value={field.value}
                          onChange={field.onChange}
                        />
                      ) : (
                        <Textarea
                          rows={4}
                          placeholder='{"100":0.95,"200":0.9}'
                          {...field}
                          onChange={(event) =>
                            field.onChange(event.target.value)
                          }
                        />
                      )}
                    </FormControl>
                    <FormDescription>
                      {t('Discount map by recharge amount (JSON object)')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <Separator />

          {/* Gateway Card: Epay */}
          <div className='rounded-xl border bg-gradient-to-br from-amber-50 to-orange-100 p-5 dark:from-amber-950 dark:to-orange-900'>
            <div className='mb-4 flex flex-wrap items-center gap-3 sm:flex-nowrap'>
              <div className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm'>
                <Building2 className='size-5' />
              </div>
              <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <h3 className='text-lg font-semibold'>{t('Epay Gateway')}</h3>
                  <Badge
                    variant='outline'
                    className='bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                  >
                    <Lock className='mr-1 size-3' />
                    {t('Classic')}
                  </Badge>
                </div>
                <p className='text-muted-foreground text-sm'>
                  {t('Configuration for Epay payment integration')}
                </p>
              </div>
            </div>

            <div className='grid gap-6 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='PayAddress'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Epay endpoint')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('https://pay.example.com')}
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Base address provided by your Epay service')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='CustomCallbackAddress'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Callback address')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('https://gateway.example.com')}
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Optional callback override. Leave blank to use server address'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className='grid gap-6 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='EpayId'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Epay merchant ID')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='10001'
                        autoComplete='off'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='EpayKey'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Epay secret key')}</FormLabel>
                    <FormControl>
                      <Input
                        type='password'
                        placeholder={t('Enter new key to update')}
                        autoComplete='new-password'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Leave blank unless rotating the secret')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <Separator />

          {/* Gateway Card: XPay */}
          <div
            className={cn(
              'rounded-xl border p-5 transition-colors',
              form.watch('XPayEnabled')
                ? 'bg-gradient-to-br from-cyan-50 to-blue-100 dark:from-cyan-950 dark:to-blue-900'
                : 'bg-muted/30'
            )}
          >
            <div className='mb-4 flex items-center justify-between gap-3'>
              <div className='flex items-center gap-3'>
                <div
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-lg shadow-sm transition-colors',
                    form.watch('XPayEnabled')
                      ? 'bg-cyan-500 text-white'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  <MessageSquare className='size-5' />
                </div>
                <div className='min-w-0'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <h3 className='text-lg font-semibold'>
                      {t('XPay Gateway')}
                    </h3>
                    {form.watch('XPayEnabled') && (
                      <Badge className='bg-cyan-500 text-white hover:bg-cyan-600'>
                        <CheckCircle2 className='mr-1 size-3' />
                        {t('Active')}
                      </Badge>
                    )}
                  </div>
                  <p className='text-muted-foreground text-sm'>
                    {t('XPay v3.1 automatic callback payment integration')}
                  </p>
                </div>
              </div>
              <Switch
                checked={form.watch('XPayEnabled')}
                onCheckedChange={(checked) =>
                  setPaymentValue('XPayEnabled', checked)
                }
              />
            </div>

            <div className='grid gap-6 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='XPayApiBase'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('XPay API base URL')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='https://pay.example.com'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Base address of your XPay v3.1 service')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='XPayGatewayPath'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('XPay create order path')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='/alipay/precreate'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('XPay v3.1 create-order API path')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className='grid gap-6 md:grid-cols-3'>
              <FormField
                control={form.control}
                name='XPayAppID'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('XPay App ID')}</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete='off'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='XPayAppSecret'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('XPay App Secret')}</FormLabel>
                    <FormControl>
                      <Input
                        type='password'
                        placeholder={t('Enter new secret to update')}
                        autoComplete='new-password'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Leave blank unless rotating the secret')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='XPayPaymentType'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('XPay payment type')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='DMF'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Default XPay channel used by wallet top-ups')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className='grid gap-6 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='XPayNotifyURL'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('XPay notify URL')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='https://118.25.43.185:3000/api/xpay/callback'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Leave blank to use the default callback URL')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='XPayReturnURL'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('XPay return URL')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='https://gateway.example.com/console/topup'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Leave blank to return to the wallet page')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className='grid gap-6 md:grid-cols-3'>
              <FormField
                control={form.control}
                name='XPayUnitPrice'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('XPay unit price')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        step='0.01'
                        min={0}
                        {...safeNumberFieldProps(field)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('How much to charge for each US dollar of balance')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='XPayMinTopUp'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('XPay minimum top-up')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        step='0.1'
                        min={0.1}
                        {...safeNumberFieldProps(field)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='XPayNotifySuccess'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('XPay success response')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='OK'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Response body returned after successful callback')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <Separator />

          {/* Gateway Card: MPay */}
          <div
            className={cn(
              'rounded-xl border p-5 transition-colors',
              form.watch('MPayEnabled')
                ? 'bg-gradient-to-br from-teal-50 to-emerald-100 dark:from-teal-950 dark:to-emerald-900'
                : 'bg-muted/30'
            )}
          >
            <div className='mb-4 flex items-center justify-between gap-3'>
              <div className='flex items-center gap-3'>
                <div
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-lg shadow-sm transition-colors',
                    form.watch('MPayEnabled')
                      ? 'bg-teal-500 text-white'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  <Smartphone className='size-5' />
                </div>
                <div className='min-w-0'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <h3 className='text-lg font-semibold'>
                      {t('MPay Gateway')}
                    </h3>
                    {form.watch('MPayEnabled') && (
                      <Badge className='bg-teal-500 text-white hover:bg-teal-600'>
                        <CheckCircle2 className='mr-1 size-3' />
                        {t('Active')}
                      </Badge>
                    )}
                  </div>
                  <p className='text-muted-foreground text-sm'>
                    {t(
                      'MPay personal-code automatic callback payment integration'
                    )}
                  </p>
                </div>
              </div>
              <Switch
                checked={form.watch('MPayEnabled')}
                onCheckedChange={(checked) =>
                  setPaymentValue('MPayEnabled', checked)
                }
              />
            </div>

            <div className='grid gap-6 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='MPayApiBase'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('MPay API base URL')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='https://mpay.example.com'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Base address of your MPay service')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='MPayPaymentType'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('MPay payment type')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='alipay'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Use alipay or wxpay')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className='grid gap-6 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='MPayPid'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('MPay merchant ID')}</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete='off'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='MPayKey'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('MPay secret key')}</FormLabel>
                    <FormControl>
                      <Input
                        type='password'
                        placeholder={t('Enter new key to update')}
                        autoComplete='new-password'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Leave blank unless rotating the secret')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className='grid gap-6 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='MPayNotifyURL'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('MPay notify URL')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='https://118.25.43.185/api/mpay/notify'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Leave blank to use the default callback URL')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='MPayReturnURL'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('MPay return URL')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='https://118.25.43.185/wallet'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Leave blank to return to the wallet page')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className='grid gap-6 md:grid-cols-3'>
              <FormField
                control={form.control}
                name='MPayUnitPrice'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('MPay unit price')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        step='0.01'
                        min={0}
                        {...safeNumberFieldProps(field)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('How much to charge for each US dollar of balance')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='MPayMinTopUp'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('MPay minimum top-up')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        step='0.1'
                        min={0.1}
                        {...safeNumberFieldProps(field)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='MPayNotifySuccess'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('MPay success response')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='success'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Response body returned after successful callback')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <Separator />

          {/* Gateway Card: Stripe */}
          <div className='rounded-xl border bg-gradient-to-br from-purple-50 to-indigo-100 p-5 dark:from-purple-950 dark:to-indigo-900'>
            <div className='mb-4 flex flex-wrap items-center gap-3 sm:flex-nowrap'>
              <div className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-purple-500 text-white shadow-sm'>
                <CreditCard className='size-5' />
              </div>
              <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <h3 className='text-lg font-semibold'>
                    {t('Stripe Gateway')}
                  </h3>
                  <Badge
                    variant='outline'
                    className='bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                  >
                    <Globe className='mr-1 size-3' />
                    {t('Global')}
                  </Badge>
                </div>
                <p className='text-muted-foreground text-sm'>
                  {t('Configuration for Stripe payment integration')}
                </p>
              </div>
            </div>

            <div className='rounded-lg bg-white/60 p-4 text-sm text-blue-900 dark:bg-black/20 dark:text-blue-100'>
              <div className='mb-2 flex items-center gap-2 font-medium'>
                <Receipt className='size-4' />
                {t('Webhook Configuration:')}
              </div>
              <ul className='list-inside list-disc space-y-1.5'>
                <li>
                  {t('Webhook URL:')}{' '}
                  <code className='rounded bg-purple-100 px-1.5 py-0.5 text-xs dark:bg-purple-900'>
                    {'<ServerAddress>/api/stripe/webhook'}
                  </code>
                </li>
                <li>
                  {t('Required events:')}{' '}
                  <code className='rounded bg-purple-100 px-1.5 py-0.5 text-xs dark:bg-purple-900'>
                    {t('checkout.session.completed')}
                  </code>{' '}
                  {t('and')}{' '}
                  <code className='rounded bg-purple-100 px-1.5 py-0.5 text-xs dark:bg-purple-900'>
                    {t('checkout.session.expired')}
                  </code>
                </li>
                <li>
                  {t('Configure at:')}{' '}
                  <a
                    href='https://dashboard.stripe.com/developers'
                    target='_blank'
                    rel='noreferrer'
                    className='underline hover:no-underline'
                  >
                    {t('Stripe Dashboard')}
                  </a>
                </li>
              </ul>
            </div>

            <div className='grid gap-6 md:grid-cols-3'>
              <FormField
                control={form.control}
                name='StripeApiSecret'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('API secret')}</FormLabel>
                    <FormControl>
                      <Input
                        type='password'
                        placeholder={t('sk_xxx or rk_xxx')}
                        autoComplete='new-password'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Stripe API key (leave blank unless updating)')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='StripeWebhookSecret'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Webhook secret')}</FormLabel>
                    <FormControl>
                      <Input
                        type='password'
                        placeholder={t('whsec_xxx')}
                        autoComplete='new-password'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Webhook signing secret (leave blank unless updating)'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='StripePriceId'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Price ID')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('price_xxx')}
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Stripe product price ID')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className='grid gap-6 md:grid-cols-3'>
              <FormField
                control={form.control}
                name='StripeUnitPrice'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('Unit price (local currency / unit)')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        step='0.01'
                        min={0}
                        {...safeNumberFieldProps(field)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('e.g., 8 means 8 local currency per unit')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='StripeMinTopUp'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Minimum top-up')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        step='0.01'
                        min={0}
                        {...safeNumberFieldProps(field)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Minimum recharge amount')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='StripePromotionCodesEnabled'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Promotion codes')}</FormLabel>
                      <FormDescription>
                        {t('Allow users to enter promo codes')}
                      </FormDescription>
                    </SettingsSwitchContent>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </SettingsSwitchItem>
                )}
              />
            </div>
          </div>

          <Separator />

          {/* Gateway Card: Creem */}
          <div className='rounded-xl border bg-gradient-to-br from-pink-50 to-rose-100 p-5 dark:from-pink-950 dark:to-rose-900'>
            <div className='mb-4 flex flex-wrap items-center gap-3 sm:flex-nowrap'>
              <div className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-pink-500 text-white shadow-sm'>
                <Sparkles className='size-5' />
              </div>
              <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <h3 className='text-lg font-semibold'>
                    {t('Creem Gateway')}
                  </h3>
                  <Badge
                    variant='outline'
                    className='bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200'
                  >
                    <UserCheck className='mr-1 size-3' />
                    {t('Modern')}
                  </Badge>
                </div>
                <p className='text-muted-foreground text-sm'>
                  {t('Configuration for Creem payment integration')}
                </p>
              </div>
            </div>

            <div className='rounded-lg bg-white/60 p-4 text-sm text-pink-900 dark:bg-black/20 dark:text-pink-100'>
              <div className='mb-2 flex items-center gap-2 font-medium'>
                <Receipt className='size-4' />
                {t('Webhook Configuration:')}
              </div>
              <ul className='list-inside list-disc space-y-1.5'>
                <li>
                  {t('Webhook URL:')}{' '}
                  <code className='rounded bg-pink-100 px-1.5 py-0.5 text-xs dark:bg-pink-900'>
                    {'<ServerAddress>/api/creem/webhook'}
                  </code>
                </li>
                <li>{t('Configure in your Creem dashboard')}</li>
              </ul>
            </div>

            <div className='grid gap-6 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='CreemApiKey'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('API Key')}</FormLabel>
                    <FormControl>
                      <Input
                        type='password'
                        placeholder={t('Enter Creem API key')}
                        autoComplete='new-password'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Creem API key (leave blank unless updating)')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='CreemWebhookSecret'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Webhook Secret')}</FormLabel>
                    <FormControl>
                      <Input
                        type='password'
                        placeholder={t('Enter webhook secret')}
                        autoComplete='new-password'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Webhook signing secret (leave blank unless updating)'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='CreemTestMode'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('Test Mode')}</FormLabel>
                    <FormDescription>
                      {t('Enable test mode for Creem payments')}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />

            <FormField
              control={form.control}
              name='CreemProducts'
              render={({ field }) => (
                <FormItem>
                  <div className='mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                    <FormLabel>{t('Products')}</FormLabel>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        setCreemProductsVisualMode(!creemProductsVisualMode)
                      }
                      className='w-full sm:w-auto'
                    >
                      {creemProductsVisualMode ? (
                        <>
                          <Code2 className='mr-2 h-3 w-3' />
                          {t('JSON Editor')}
                        </>
                      ) : (
                        <>
                          <Eye className='mr-2 h-3 w-3' />
                          {t('Visual Editor')}
                        </>
                      )}
                    </Button>
                  </div>
                  <FormControl>
                    {creemProductsVisualMode ? (
                      <CreemProductsVisualEditor
                        value={field.value}
                        onChange={field.onChange}
                      />
                    ) : (
                      <Textarea
                        rows={4}
                        placeholder='[{"name":"Basic","productId":"prod_xxx","price":10,"quota":500000,"currency":"USD"}]'
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    )}
                  </FormControl>
                  <FormDescription>
                    {t('Configure Creem products. Provide a JSON array.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Separator />

          <WaffoPancakeSettingsSection
            defaultValues={waffoPancakeDefaultValues}
            values={waffoPancakeValues}
            onValueChange={setWaffoPancakeValue}
            selectedBinding={waffoPancakeSelection}
            savedBinding={waffoPancakeSavedBinding}
            onSelectedBindingChange={setWaffoPancakeSelection}
          />

          <Separator />

          <WaffoSettingsSection
            values={waffoValues}
            onValueChange={setWaffoValue}
            payMethods={waffoPayMethods}
            onPayMethodsChange={setWaffoPayMethods}
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
