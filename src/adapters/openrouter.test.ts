import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.hoisted(() => vi.fn())

vi.mock('openai', () => ({
  default: vi.fn(function () {
    return { chat: { completions: { create: mockCreate } } }
  }),
}))

import { createOpenRouterAdapter } from './openrouter.js'
import { DEFAULT_OPENROUTER_MODEL } from '../constants.js'

describe('createOpenRouterAdapter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns an object with a chat method', () => {
    expect(createOpenRouterAdapter('key')).toHaveProperty('chat')
  })

  it('yields chunks from the stream', async () => {
    mockCreate.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [{ delta: { content: 'Hi' } }] }
        yield { choices: [{ delta: {} }] }
      },
    })

    const chunks: string[] = []
    for await (const chunk of createOpenRouterAdapter('key').chat([
      { role: 'user', content: 'hello' },
    ])) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual(['Hi'])
  })

  it('uses the default model when none is specified', async () => {
    mockCreate.mockResolvedValue({ [Symbol.asyncIterator]: async function* () {} })
    for await (const _ of createOpenRouterAdapter('key').chat([])) {
    }
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: DEFAULT_OPENROUTER_MODEL }),
    )
  })

  it('overrides the model when specified in options', async () => {
    mockCreate.mockResolvedValue({ [Symbol.asyncIterator]: async function* () {} })
    for await (const _ of createOpenRouterAdapter('key').chat([], {
      model: 'anthropic/claude-3-haiku',
    })) {
    }
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'anthropic/claude-3-haiku' }),
    )
  })

  it('enables streaming in the API call', async () => {
    mockCreate.mockResolvedValue({ [Symbol.asyncIterator]: async function* () {} })
    for await (const _ of createOpenRouterAdapter('key').chat([])) {
    }
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ stream: true }))
  })
})
