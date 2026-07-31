import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { LogOtherData, UsageLog } from '../types'
import {
  formatTokensPerSecond,
  getLogThroughput,
  getLogThroughputAssessment,
} from './throughput'

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
    })
  })

  test('accepts a full-second measured stream window', () => {
    assert.deepEqual(
      getLogThroughput(makeLog(), {
        relay_trace: {
          attempts: [{ application_stream_after_first_event_ms: 1_000 }],
        },
      }),
      {
        tokensPerSecond: 400,
        durationMs: 1_000,
        source: 'upstream_after_first_event',
      }
    )
  })

  test('rejects sub-second and implausibly high measured rates', () => {
    assert.equal(
      getLogThroughput(makeLog(), {
        relay_trace: {
          attempts: [{ application_stream_after_first_event_ms: 999 }],
        },
      }),
      null
    )
    assert.equal(
      getLogThroughput(makeLog({ completion_tokens: 1_001 }), {
        relay_trace: {
          attempts: [{ application_stream_after_first_event_ms: 1_000 }],
        },
      }),
      null
    )
  })

  test('does not use full relay duration as a throughput fallback', () => {
    const log = makeLog()

    assert.equal(
      getLogThroughput(log, {
        relay_trace: { gateway: { upstream_relay_ms: 16_000 } },
      }),
      null
    )
    assert.equal(getLogThroughput(log, { frt: 4_000 }), null)
  })

  test('reports the production buffered sample as unavailable', () => {
    const log = makeLog({
      user_id: 149,
      completion_tokens: 287,
      use_time: 21,
    })
    const other: LogOtherData = {
      relay_trace: {
        total_ms: 20_728,
        gateway: { first_event_ms: 20_724, upstream_relay_ms: 20_495 },
        client: { stream_span_ms: 3 },
        attempts: [
          {
            application_stream_after_first_event_ms: 2,
            application_body_read_span_ms: 2,
          },
        ],
      },
    }

    assert.equal(getLogThroughput(log, other), null)
    assert.deepEqual(getLogThroughputAssessment(log, other), {
      throughput: null,
      unavailableReason: 'buffered_stream',
    })
  })

  test('does not use a late parsed SSE event as a measured stream window', () => {
    const assessment = getLogThroughputAssessment(makeLog(), {
      relay_trace: {
        gateway: { upstream_relay_ms: 12_000 },
        attempts: [
          {
            application_body_read_span_ms: 11_000,
            application_stream_after_first_event_ms: 2_000,
          },
        ],
      },
    })

    assert.deepEqual(assessment, {
      throughput: null,
      unavailableReason: 'buffered_stream',
    })
  })

  test('keeps a verified continuous production sample measurable', () => {
    const throughput = getLogThroughput(
      makeLog({ completion_tokens: 364 }),
      {
        relay_trace: {
          attempts: [
            {
              application_body_read_span_ms: 9_721,
              application_stream_after_first_event_ms: 9_721,
            },
          ],
        },
      }
    )

    assert.equal(throughput?.tokensPerSecond, 364_000 / 9_721)
    assert.equal(throughput?.source, 'upstream_after_first_event')
  })

  test('does not report incomplete streams as throughput', () => {
    assert.equal(
      getLogThroughput(makeLog(), {
        stream_status: { status: 'error' },
        relay_trace: {
          client: { stream_span_ms: 10_000 },
        },
      }),
      null
    )
  })

  test('does not present locally estimated tokens as measured throughput', () => {
    assert.equal(
      getLogThroughput(makeLog(), {
        admin_info: { local_count_tokens: true },
        relay_trace: {
          gateway: { upstream_relay_ms: 10_000 },
          attempts: [{ application_stream_after_first_event_ms: 10_000 }],
        },
      }),
      null
    )
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
    assert.equal(
      getLogThroughput(makeLog({ completion_tokens: -1 }), {
        relay_trace: { gateway: { upstream_relay_ms: 10_000 } },
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
