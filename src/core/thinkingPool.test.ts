import { describe, it, expect, vi } from 'vitest'
import { createThinkingPool } from './thinkingPool.js'
import type { LLMAdapter } from '../adapters/types.js'
import type { Logger } from './logger.js'
import { THINKING_POOL_BATCH_SIZE } from '../constants.js'

const logger: Logger = { error: vi.fn() }

function makeLLM(response: string): LLMAdapter {
  return {
    chat: vi.fn().mockImplementation(async function* () {
      yield response
    }),
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createThinkingPool', () => {
  it('returns a fallback line immediately while the pool is cold', () => {
    const pool = createThinkingPool(makeLLM('generated…'), ['fallback…'], logger)
    expect(pool.take(-1)).toBe('fallback…')
  })

  it('serves LLM-generated lines once the refill completes', async () => {
    const pool = createThinkingPool(makeLLM('line one…\nline two…'), ['fallback…'], logger)
    pool.take(-1)
    await flush()
    expect(pool.take(-1)).toBe('line one…')
    expect(pool.take(-1)).toBe('line two…')
  })

  it('passes the persona lore to the generation prompt', async () => {
    const llm = makeLLM('line…')
    const pool = createThinkingPool(llm, ['fallback…'], logger)
    pool.take(-1, ['You are Annabel'])
    await flush()
    const messages = vi.mocked(llm.chat).mock.calls[0][0]
    expect(messages.find((m) => m.role === 'user')?.content).toContain('You are Annabel')
    expect(messages.find((m) => m.role === 'user')?.content).toContain(
      `${THINKING_POOL_BATCH_SIZE} lines`,
    )
  })

  it('keeps pools separate per chat', async () => {
    const pool = createThinkingPool(makeLLM('shared line…'), ['fallback…'], logger)
    pool.take(-1)
    await flush()
    expect(pool.take(-2)).toBe('fallback…')
    expect(pool.take(-1)).toBe('shared line…')
  })

  it('does not start concurrent refills for the same chat', async () => {
    const llm = makeLLM('a…\nb…\nc…\nd…\ne…')
    const pool = createThinkingPool(llm, ['fallback…'], logger)
    pool.take(-1)
    pool.take(-1)
    pool.take(-1)
    await flush()
    expect(llm.chat).toHaveBeenCalledTimes(1)
  })

  it('cleans numbering and quotes from generated lines', async () => {
    const pool = createThinkingPool(makeLLM('1. "first…"\n- second…'), ['fallback…'], logger)
    pool.take(-1)
    await flush()
    expect(pool.take(-1)).toBe('first…')
    expect(pool.take(-1)).toBe('second…')
  })

  it('falls back and logs when generation fails', async () => {
    const llm: LLMAdapter = {
      chat: vi.fn().mockImplementation(async function* () {
        throw new Error('boom')
      }),
    }
    const log: Logger = { error: vi.fn() }
    const pool = createThinkingPool(llm, ['fallback…'], log)
    pool.take(-1)
    await flush()
    expect(pool.take(-1)).toBe('fallback…')
    expect(log.error).toHaveBeenCalled()
  })
})
