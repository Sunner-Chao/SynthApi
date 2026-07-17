import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { LogOtherData, UsageLog } from '../types'
import { formatTokensPerSecond, getLogThroughput } from './throughput'

function makeLog(overrides: Partial<UsageLog> = {}): UsageLog {
  return {
    id: 1,
    user_id: 20,
    created_at: 0,
    type: 2,
    content: '',
    model_name: 'test-model',
    quota: 0,
    prompt_tokens: 100,
    completion_tokens: 400,
    use_time: 20,
    is_stream: true,
    channel: 1,
    other: '',
    ...overrides,
  }
}

describe('getLogThroughput', () => {
  test('uses the final upstream attempt after-first-event duration', () => {
    const other: LogOtherData = {
      relay_trace: {
        attempts: [
          { application_stream_after_first_event_ms: 50_000 },
          { application_stream_after_first_event_ms: 10_000 },
        ],
        client: { stream_span_ms: 12_000 },
      },
    }

    assert.deepEqual(getLogThroughput(makeLog(), other), {
      tokensPerSecond: 40,
      durationMs: 10_000,
      source: 'upstream_after_first_event',
      estimated: false,
    })
  })

  test('falls back through client, gateway, and first-response durations', () => {
    const log = makeLog()

    assert.equal(
      getLogThroughput(log, {
        relay_trace: { client: { stream_span_ms: 8_000 } },
      })?.tokensPerSecond,
      50
    )
    assert.deepEqual(
      getLogThroughput(log, {
        relay_trace: { total_ms: 20_000, gateway: { first_event_ms: 4_000 } },
      }),
      {
        tokensPerSecond: 25,
        durationMs: 16_000,
        source: 'gateway_after_first_event',
        estimated: true,
      }
    )
    assert.equal(getLogThroughput(log, { frt: 4_000 })?.tokensPerSecond, 25)
  })

  test('does not report misleading throughput without a streaming duration', () => {
    assert.equal(getLogThroughput(makeLog({ is_stream: false }), null), null)
    assert.equal(getLogThroughput(makeLog(), null), null)
    assert.equal(
      getLogThroughput(makeLog({ completion_tokens: 0 }), {
        relay_trace: { client: { stream_span_ms: 10_000 } },
      }),
      null
    )
  })
})

describe('formatTokensPerSecond', () => {
  test('keeps one decimal place', () => {
    assert.equal(formatTokensPerSecond(43.045), '43.0')
    assert.equal(formatTokensPerSecond(0), '-')
  })
})
