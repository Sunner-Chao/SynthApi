import { AxiosError, AxiosHeaders } from 'axios'
import i18next from 'i18next'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toast } from 'sonner'
import { getServerErrorMessage, handleServerError } from './handle-server-error'

function httpError(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() }
  return new AxiosError('Request failed', undefined, config, undefined, {
    status,
    data,
    statusText: '',
    headers: {},
    config,
  })
}

test('reports meaningful API errors and rate limits only once', async () => {
  await i18next.init({ lng: 'en', resources: { en: { translation: {} } } })
  assert.equal(
    getServerErrorMessage(httpError(403, { message: 'Permission denied' })),
    'Permission denied'
  )
  assert.equal(
    getServerErrorMessage(httpError(429, '')),
    'Too many requests Please try again later.'
  )
  assert.equal(
    getServerErrorMessage(httpError(500, '<html>Gateway error</html>')),
    'Internal Server Error!'
  )
  assert.equal(
    getServerErrorMessage(new Error('Connection failed')),
    'Connection failed'
  )
  const original = toast.error
  const messages: unknown[] = []
  toast.error = (message) => {
    messages.push(message)
    return 'test-toast'
  }
  try {
    const error = httpError(429, '')
    handleServerError(error) // Axios interceptor
    handleServerError(error) // component catch
    handleServerError(error) // React Query
    assert.deepEqual(messages, ['Too many requests Please try again later.'])
  } finally {
    toast.error = original
  }
})
