import { describe, it, expect, vi } from 'vitest'
import { createFactExtractor } from './factExtractor.js'
import type { LLMAdapter } from '../adapters/types.js'

function makeLLM(response: string): LLMAdapter {
  return {
    chat: vi.fn().mockImplementation(async function* () {
      yield response
    }),
  }
}

describe('createFactExtractor', () => {
  describe('extract()', () => {
    it('returns an empty array when the LLM responds with "none"', async () => {
      const facts = await createFactExtractor(makeLLM('none')).extract('hi', 'hello')
      expect(facts).toEqual([])
    })

    it('is case-insensitive when checking for "none"', async () => {
      const facts = await createFactExtractor(makeLLM('None')).extract('hi', 'hello')
      expect(facts).toEqual([])
    })

    it('returns a single fact when the LLM extracts one', async () => {
      const facts = await createFactExtractor(makeLLM("User's name is Alice")).extract(
        'My name is Alice',
        'Nice to meet you, Alice!',
      )
      expect(facts).toEqual(["User's name is Alice"])
    })

    it('splits multiple facts into separate array entries', async () => {
      const llmResponse = "User's name is Bob\nUser lives in Berlin\nUser is a software engineer"
      const facts = await createFactExtractor(makeLLM(llmResponse)).extract('...', '...')
      expect(facts).toEqual([
        "User's name is Bob",
        'User lives in Berlin',
        'User is a software engineer',
      ])
    })

    it('trims whitespace and ignores blank lines', async () => {
      const llmResponse = "\n  User's name is Carol  \n\n  User is 30 years old  \n"
      const facts = await createFactExtractor(makeLLM(llmResponse)).extract('...', '...')
      expect(facts).toEqual(["User's name is Carol", 'User is 30 years old'])
    })

    it('passes the exchange as user/assistant content to the LLM', async () => {
      const llm = makeLLM('none')
      await createFactExtractor(llm).extract('hello there', 'hi!')
      const messages = vi.mocked(llm.chat).mock.calls[0][0]
      const userMessage = messages.find((m) => m.role === 'user')
      expect(userMessage?.content).toContain('hello there')
      expect(userMessage?.content).toContain('hi!')
    })

    it('requests temperature 0 for deterministic output', async () => {
      const llm = makeLLM('none')
      await createFactExtractor(llm).extract('q', 'a')
      const options = vi.mocked(llm.chat).mock.calls[0][1]
      expect(options?.temperature).toBe(0)
    })
  })
})
