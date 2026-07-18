import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { LogOtherData } from '../types'
import { getFirstResponseTimeColor } from './format'
import {
  getLogFirstResponseLatency,
  getUpstreamFirstResponseLatency,
} from './latency'

describe('getLogFirstResponseLatency', () => {
  test('uses upstream-to-first-event latency for streaming requests', () => {
    const other: LogOtherData = {
      frt: 190_999,
      relay_trace: {
        attempts: [
          {
            application_first_body_read_ms: 19_000,
            upstream_to_first_event_ms: 18_469,
          },
        ],
      },
    }

    assert.deepEqual(getLogFirstResponseLatency({ is_stream: true }, other), {
      milliseconds: 18_469,
      source: 'upstream_first_event',
    })
  })

  test('uses application first-body latency for non-streaming requests', () => {
    const other: LogOtherData = {
      frt: 45_000,
      relay_trace: {
        attempts: [
          {
            application_first_body_read_ms: 7_500,
            upstream_to_first_event_ms: 6_500,
          },
        ],
      },
    }

    assert.deepEqual(getLogFirstResponseLatency({ is_stream: false }, other), {
      milliseconds: 7_500,
      source: 'upstream_first_body',
    })
  })

  test('falls back to legacy end-to-end first response latency', () => {
    assert.deepEqual(
      getLogFirstResponseLatency({ is_stream: true }, { frt: 12_345 }),
      { milliseconds: 12_345, source: 'end_to_end' }
    )
  })

  test('ignores zero, negative, and non-finite values', () => {
    const other: LogOtherData = {
      frt: Number.NaN,
      relay_trace: {
        attempts: [{ upstream_to_first_event_ms: 0 }],
      },
    }

    assert.equal(getLogFirstResponseLatency({ is_stream: true }, other), null)
    assert.equal(
      getLogFirstResponseLatency({ is_stream: false }, { frt: -1 }),
      null
    )
  })

  test('uses only the final upstream attempt', () => {
    const other: LogOtherData = {
      frt: 50_000,
      relay_trace: {
        attempts: [
          { upstream_to_first_event_ms: 1_000 },
          { upstream_to_first_event_ms: 9_000 },
        ],
      },
    }

    assert.deepEqual(
      getUpstreamFirstResponseLatency({ is_stream: true }, other),
      { milliseconds: 9_000, source: 'upstream_first_event' }
    )
  })
})

describe('getFirstResponseTimeColor', () => {
  test('uses the configured 10-second and 30-second boundaries', () => {
    assert.equal(getFirstResponseTimeColor(9.999), 'success')
    assert.equal(getFirstResponseTimeColor(10), 'warning')
    assert.equal(getFirstResponseTimeColor(30), 'warning')
    assert.equal(getFirstResponseTimeColor(30.001), 'danger')
  })
})
