import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.hoisted(() => vi.fn())
const mockOpenAI = vi.hoisted(() =>
  vi.fn(function () {
    return { embeddings: { create: mockCreate } }
  }),
)

vi.mock('openai', () => ({ default: mockOpenAI }))

import { createEmbedder } from './embedder.js'
import { DEFAULT_EMBED_MODEL, OLLAMA_API_KEY, OLLAMA_BASE_URL } from '../constants.js'

describe('createEmbedder', () => {
  beforeEach(() => vi.clearAllMocks())

  it('exposes the model name', () => {
    expect(createEmbedder('custom-model').model).toBe('custom-model')
  })

  it('uses the default model when none is specified', () => {
    expect(createEmbedder().model).toBe(DEFAULT_EMBED_MODEL)
  })

  it('passes baseUrl and apiKey to the OpenAI client', () => {
    createEmbedder('model', 'http://custom:11434/v1', 'my-key')
    expect(mockOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'http://custom:11434/v1', apiKey: 'my-key' }),
    )
  })

  it('defaults to Ollama baseUrl and apiKey', () => {
    createEmbedder()
    expect(mockOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: OLLAMA_BASE_URL, apiKey: OLLAMA_API_KEY }),
    )
  })

  describe('embed()', () => {
    it('returns the embedding vector for a string', async () => {
      const vector = [0.1, 0.2, 0.3]
      mockCreate.mockResolvedValue({ data: [{ embedding: vector }] })

      const result = await createEmbedder().embed('hello')

      expect(result).toEqual(vector)
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ input: 'hello' }))
    })

    it('passes the configured model to the API', async () => {
      mockCreate.mockResolvedValue({ data: [{ embedding: [0] }] })
      await createEmbedder('my-model').embed('test')
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'my-model' }))
    })
  })

  describe('embedBatch()', () => {
    it('returns a vector for each input string', async () => {
      const vectors = [
        [0.1, 0.2],
        [0.3, 0.4],
      ]
      mockCreate.mockResolvedValue({
        data: [{ embedding: vectors[0] }, { embedding: vectors[1] }],
      })

      const result = await createEmbedder().embedBatch(['a', 'b'])

      expect(result).toEqual(vectors)
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ input: ['a', 'b'] }))
    })
  })
})
