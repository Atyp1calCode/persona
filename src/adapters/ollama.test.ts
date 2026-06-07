import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.hoisted(() => vi.fn())

vi.mock('openai', () => ({
  default: vi.fn(function () {
    return { chat: { completions: { create: mockCreate } } }
  }),
}))

import { createOllamaAdapter } from './ollama.js'
import { DEFAULT_OLLAMA_MODEL } from '../constants.js'

describe('createOllamaAdapter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns an object with a chat method', () => {
    expect(createOllamaAdapter()).toHaveProperty('chat')
  })

  it('yields chunks from the stream', async () => {
    mockCreate.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [{ delta: { content: 'Hello' } }] }
        yield { choices: [{ delta: { content: ' world' } }] }
        yield { choices: [{ delta: {} }] }
      },
    })

    const chunks: string[] = []
    for await (const chunk of createOllamaAdapter().chat([{ role: 'user', content: 'hi' }])) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual(['Hello', ' world'])
  })

  it('uses the default model when none is specified in options', async () => {
    mockCreate.mockResolvedValue({ [Symbol.asyncIterator]: async function* () {} })
    for await (const _ of createOllamaAdapter().chat([])) {
    }
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: DEFAULT_OLLAMA_MODEL }),
    )
  })

  it('overrides the model when specified in options', async () => {
    mockCreate.mockResolvedValue({ [Symbol.asyncIterator]: async function* () {} })
    for await (const _ of createOllamaAdapter().chat([], { model: 'mistral' })) {
    }
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'mistral' }))
  })

  it('passes temperature to the API when specified', async () => {
    mockCreate.mockResolvedValue({ [Symbol.asyncIterator]: async function* () {} })
    for await (const _ of createOllamaAdapter().chat([], { temperature: 0.5 })) {
    }
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.5 }))
  })
})
