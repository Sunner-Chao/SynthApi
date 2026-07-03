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
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { refreshSelf } from '@/lib/api'
import {
  getImageGenerationTask,
  sendChatCompletion,
  sendImageGeneration,
} from '../api'
import { MESSAGE_STATUS, ERROR_MESSAGES } from '../constants'
import {
  buildChatCompletionPayload,
  getCurrentVersion,
  updateAssistantMessageWithError,
  updateLastAssistantMessage,
  processStreamingContent,
  finalizeMessage,
  updateCurrentVersionContent,
} from '../lib'
import type {
  ImageGenerationData,
  ImageGenerationResponse,
  Message,
  PlaygroundConfig,
  ParameterEnabled,
} from '../types'
import { useStreamRequest } from './use-stream-request'

interface UseChatHandlerOptions {
  config: PlaygroundConfig
  parameterEnabled: ParameterEnabled
  onMessageUpdate: (updater: (prev: Message[]) => Message[]) => void
}

/**
 * Hook for handling chat message sending and receiving
 */
export function useChatHandler({
  config,
  parameterEnabled,
  onMessageUpdate,
}: UseChatHandlerOptions) {
  const { sendStreamRequest, stopStream, isStreaming } = useStreamRequest()
  const [isImageGenerating, setIsImageGenerating] = useState(false)
  const imageAbortRef = useRef<AbortController | null>(null)

  const imageGenerationModel =
    config.model.toLowerCase().includes('image') ||
    config.model.toLowerCase().includes('dall-e')
      ? config.model
      : 'gpt-image-2'

  const getImageErrorMessage = (error: unknown) => {
    const err = error as {
      response?: {
        data?: {
          message?: string
          error?: { message?: string; code?: string }
        }
      }
      message?: string
      name?: string
    }

    if (err?.name === 'AbortError') return ERROR_MESSAGES.INTERRUPTED
    return (
      err?.response?.data?.error?.message ||
      err?.response?.data?.message ||
      err?.message ||
      ERROR_MESSAGES.API_REQUEST_ERROR
    )
  }

  const getImageErrorCode = (error: unknown) => {
    const err = error as {
      response?: { data?: { error?: { code?: string } } }
    }
    return err?.response?.data?.error?.code || undefined
  }

  const pickImageData = (response: ImageGenerationResponse) =>
    response.data?.find((item) => item.url || item.b64_json)

  const pickTaskId = (response: ImageGenerationResponse) =>
    response.data?.find((item) => item.task_id)?.task_id ||
    response.task_id ||
    response.id ||
    ''

  const buildImageMarkdown = (
    item: ImageGenerationData,
    response?: ImageGenerationResponse
  ) => {
    const src = item.url || `data:image/png;base64,${item.b64_json || ''}`
    const revisedPrompt = item.revised_prompt?.trim()
    const status = response?.status?.trim()
    const prefix =
      revisedPrompt && revisedPrompt.length > 0
        ? `生成完成。\n\n> ${revisedPrompt}\n\n`
        : '生成完成。\n\n'
    const suffix = status && status !== 'succeeded' ? `\n\n状态：${status}` : ''
    return `${prefix}![生成图片](${src})${suffix}`
  }

  const updateImageStatus = (content: string) => {
    onMessageUpdate((prev) =>
      updateLastAssistantMessage(prev, (message) => ({
        ...updateCurrentVersionContent(message, content),
        status: MESSAGE_STATUS.STREAMING,
      }))
    )
  }

  const completeImageMessage = (
    content: string,
    status = MESSAGE_STATUS.COMPLETE
  ) => {
    onMessageUpdate((prev) =>
      updateLastAssistantMessage(prev, (message) => ({
        ...finalizeMessage(updateCurrentVersionContent(message, content)),
        status,
      }))
    )
  }

  const waitForImageTask = async (
    taskId: string,
    signal: AbortSignal
  ): Promise<ImageGenerationResponse> => {
    const startedAt = Date.now()
    let lastStatus = ''

    while (Date.now() - startedAt < 900_000) {
      if (signal.aborted) {
        throw new DOMException(ERROR_MESSAGES.INTERRUPTED, 'AbortError')
      }

      const response = await getImageGenerationTask(taskId, signal)
      const status = (response.status || '').toLowerCase()
      const progress = response.progress ? ` ${response.progress}` : ''

      if (status && `${status}${progress}` !== lastStatus) {
        lastStatus = `${status}${progress}`
        updateImageStatus(`图片生成中... ${lastStatus}`)
      }

      if (pickImageData(response)) return response
      if (['succeeded', 'completed', 'success'].includes(status))
        return response
      if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
        throw new Error(
          response.error?.message || response.message || '图片生成失败'
        )
      }

      await new Promise((resolve) => window.setTimeout(resolve, 3000))
    }

    throw new Error('图片生成超时，请稍后在任务记录中查看结果')
  }

  const sendImage = useCallback(
    async (messages: Message[]) => {
      const latestUserMessage = [...messages]
        .reverse()
        .find((message) => message.from === 'user')
      const prompt = latestUserMessage
        ? getCurrentVersion(latestUserMessage).content.trim()
        : ''

      if (!prompt) {
        const message = '请输入图片描述'
        toast.error(message)
        onMessageUpdate((prev) =>
          updateAssistantMessageWithError(prev, message)
        )
        return
      }

      const controller = new AbortController()
      imageAbortRef.current = controller
      setIsImageGenerating(true)
      updateImageStatus('图片生成中...')

      try {
        const response = await sendImageGeneration(
          {
            model: imageGenerationModel,
            group: config.group,
            prompt,
            size: '16:9',
            resolution: '1k',
            n: 1,
          },
          controller.signal
        )

        let finalResponse = response
        let imageData = pickImageData(response)
        const taskId = pickTaskId(response)

        if (!imageData && taskId) {
          updateImageStatus('图片任务已提交，正在生成中...')
          finalResponse = await waitForImageTask(taskId, controller.signal)
          imageData = pickImageData(finalResponse)
        }

        if (!imageData) {
          throw new Error(
            finalResponse.message || '图片生成完成，但没有返回图片地址'
          )
        }

        void refreshSelf()
        completeImageMessage(buildImageMarkdown(imageData, finalResponse))
      } catch (error: unknown) {
        const message = getImageErrorMessage(error)
        if (message === ERROR_MESSAGES.INTERRUPTED) {
          completeImageMessage('已停止生成图片。')
          return
        }

        toast.error(message)
        onMessageUpdate((prev) =>
          updateAssistantMessageWithError(
            prev,
            message,
            getImageErrorCode(error)
          )
        )
      } finally {
        if (imageAbortRef.current === controller) {
          imageAbortRef.current = null
        }
        setIsImageGenerating(false)
      }
    },
    [config.group, imageGenerationModel, onMessageUpdate]
  )

  // Handle stream update
  const handleStreamUpdate = useCallback(
    (type: 'reasoning' | 'content', chunk: string) => {
      onMessageUpdate((prev) =>
        updateLastAssistantMessage(prev, (message) => {
          if (message.status === MESSAGE_STATUS.ERROR) return message

          if (type === 'reasoning') {
            // Direct API reasoning_content
            return {
              ...message,
              reasoning: {
                content: (message.reasoning?.content || '') + chunk,
                duration: 0,
              },
              isReasoningStreaming: true,
              status: MESSAGE_STATUS.STREAMING,
            }
          }

          // Content streaming: handle <think> tags
          return {
            ...processStreamingContent(message, chunk),
            status: MESSAGE_STATUS.STREAMING,
          }
        })
      )
    },
    [onMessageUpdate]
  )

  // Handle stream complete
  const handleStreamComplete = useCallback(() => {
    void refreshSelf()
    onMessageUpdate((prev) =>
      updateLastAssistantMessage(prev, (message) =>
        message.status === MESSAGE_STATUS.COMPLETE ||
        message.status === MESSAGE_STATUS.ERROR
          ? message
          : { ...finalizeMessage(message), status: MESSAGE_STATUS.COMPLETE }
      )
    )
  }, [onMessageUpdate])

  // Handle stream error
  const handleStreamError = useCallback(
    (error: string, errorCode?: string) => {
      toast.error(error)
      onMessageUpdate((prev) =>
        updateAssistantMessageWithError(prev, error, errorCode)
      )
    },
    [onMessageUpdate]
  )

  // Send streaming chat request
  const sendStreamingChat = useCallback(
    (messages: Message[]) => {
      const payload = buildChatCompletionPayload(
        messages,
        config,
        parameterEnabled
      )
      sendStreamRequest(
        payload,
        handleStreamUpdate,
        handleStreamComplete,
        handleStreamError
      )
    },
    [
      config,
      parameterEnabled,
      sendStreamRequest,
      handleStreamUpdate,
      handleStreamComplete,
      handleStreamError,
    ]
  )

  // Send non-streaming chat request
  const sendNonStreamingChat = useCallback(
    async (messages: Message[]) => {
      const payload = buildChatCompletionPayload(
        messages,
        config,
        parameterEnabled
      )

      try {
        const response = await sendChatCompletion(payload)
        void refreshSelf()
        const choice = response.choices?.[0]
        if (!choice) return

        onMessageUpdate((prev) =>
          updateLastAssistantMessage(prev, (message) => ({
            ...finalizeMessage(
              {
                ...message,
                versions: [
                  {
                    ...message.versions[0],
                    content: choice.message?.content || '',
                  },
                ],
              },
              choice.message?.reasoning_content
            ),
            status: MESSAGE_STATUS.COMPLETE,
          }))
        )
      } catch (error: unknown) {
        const err = error as {
          response?: {
            data?: { message?: string; error?: { code?: string } }
          }
          message?: string
        }
        handleStreamError(
          err?.response?.data?.message ||
            err?.message ||
            ERROR_MESSAGES.API_REQUEST_ERROR,
          err?.response?.data?.error?.code || undefined
        )
      }
    },
    [config, parameterEnabled, onMessageUpdate, handleStreamError]
  )

  // Send chat request (stream or non-stream based on config)
  const sendChat = useCallback(
    (messages: Message[]) => {
      if (config.stream) {
        sendStreamingChat(messages)
      } else {
        sendNonStreamingChat(messages)
      }
    },
    [config.stream, sendStreamingChat, sendNonStreamingChat]
  )

  const sendImageGenerationChat = useCallback(
    (messages: Message[]) => {
      void sendImage(messages)
    },
    [sendImage]
  )

  // Stop generation
  const stopGeneration = useCallback(() => {
    stopStream()
    imageAbortRef.current?.abort()
    onMessageUpdate((prev) =>
      updateLastAssistantMessage(prev, (message) =>
        message.status === MESSAGE_STATUS.LOADING ||
        message.status === MESSAGE_STATUS.STREAMING
          ? { ...finalizeMessage(message), status: MESSAGE_STATUS.COMPLETE }
          : message
      )
    )
  }, [stopStream, onMessageUpdate])

  return {
    sendChat,
    sendImageGeneration: sendImageGenerationChat,
    stopGeneration,
    isGenerating: isStreaming || isImageGenerating,
  }
}
