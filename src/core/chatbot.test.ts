import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createChatbot } from './chatbot.js'
import type { LLMAdapter } from '../adapters/types.js'
import type { Retriever } from '../rag/retriever.js'
import type { MemoryRecord } from '../rag/vectorStore.js'
import type { FactExtractor } from './factExtractor.js'
import { DEFAULT_SYSTEM_PROMPT } from '../constants.js'

function makeRecord(text: string, type: 'lore' | 'chat' = 'lore'): MemoryRecord {
  return { id: '1', text, vector: [], type, sessionId: '', metadata: '{}' }
}

describe('createChatbot', () => {
  let llm: LLMAdapter
  let retriever: Retriever

  beforeEach(() => {
    llm = {
      chat: vi.fn().mockImplementation(async function* () {
        yield 'Hello'
        yield ' world'
      }),
    }
    retriever = {
      retrieve: vi.fn().mockResolvedValue({ lore: [], history: [] }),
      saveExchange: vi.fn().mockResolvedValue(undefined),
      addLore: vi.fn().mockResolvedValue('id'),
    }
  })

  it('yields all chunks from the LLM', async () => {
    const chunks: string[] = []
    for await (const chunk of createChatbot(llm, retriever).chat('hi', 's1')) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual(['Hello', ' world'])
  })

  it('retrieves context before calling the LLM', async () => {
    for await (const _ of createChatbot(llm, retriever).chat('hi', 'session-1')) {
    }
    expect(retriever.retrieve).toHaveBeenCalledWith('hi', 'session-1')
  })

  it('uses the default system prompt when none is provided', async () => {
    for await (const _ of createChatbot(llm, retriever).chat('hi', 's1')) {
    }
    const messages = vi.mocked(llm.chat).mock.calls[0][0]
    expect(messages[0]).toEqual({ role: 'system', content: DEFAULT_SYSTEM_PROMPT })
  })

  it('uses a custom system prompt when provided', async () => {
    for await (const _ of createChatbot(llm, retriever, 'You are a pirate.').chat('hi', 's1')) {
    }
    const messages = vi.mocked(llm.chat).mock.calls[0][0]
    expect(messages[0].content).toBe('You are a pirate.')
  })

  it('passes the user message as the last message', async () => {
    for await (const _ of createChatbot(llm, retriever).chat('what is X?', 's1')) {
    }
    const messages = vi.mocked(llm.chat).mock.calls[0][0]
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'what is X?' })
  })

  it('injects lore into the system prompt when available', async () => {
    vi.mocked(retriever.retrieve).mockResolvedValue({
      lore: [makeRecord('Dragons exist.')],
      history: [],
    })

    for await (const _ of createChatbot(llm, retriever).chat('tell me', 's1')) {
    }

    const systemContent = vi.mocked(llm.chat).mock.calls[0][0][0].content
    expect(systemContent).toContain('## Relevant Knowledge')
    expect(systemContent).toContain('Dragons exist.')
  })

  it('injects history into the system prompt when available', async () => {
    vi.mocked(retriever.retrieve).mockResolvedValue({
      lore: [],
      history: [makeRecord('User: hello\nAssistant: hi', 'chat')],
    })

    for await (const _ of createChatbot(llm, retriever).chat('again', 's1')) {
    }

    const systemContent = vi.mocked(llm.chat).mock.calls[0][0][0].content
    expect(systemContent).toContain('## Relevant Past Exchanges')
    expect(systemContent).toContain('User: hello\nAssistant: hi')
  })

  it('does not modify the system prompt when there is no context', async () => {
    for await (const _ of createChatbot(llm, retriever, 'Be helpful.').chat('hi', 's1')) {
    }
    const systemContent = vi.mocked(llm.chat).mock.calls[0][0][0].content
    expect(systemContent).toBe('Be helpful.')
  })

  it('saves the full exchange after streaming completes', async () => {
    for await (const _ of createChatbot(llm, retriever).chat('hello', 'session-1')) {
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(retriever.saveExchange).toHaveBeenCalledWith('hello', 'Hello world', 'session-1')
  })

  describe('fact extraction', () => {
    let factExtractor: FactExtractor

    beforeEach(() => {
      factExtractor = {
        extract: vi.fn().mockResolvedValue([]),
      }
    })

    it('calls the fact extractor with the user message and full response', async () => {
      for await (const _ of createChatbot(llm, retriever, undefined, factExtractor).chat(
        'my name is Dave',
        's1',
      )) {
      }
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(factExtractor.extract).toHaveBeenCalledWith('my name is Dave', 'Hello world')
    })

    it('saves each extracted fact as lore', async () => {
      vi.mocked(factExtractor.extract).mockResolvedValue(["User's name is Dave", 'User is 30'])
      for await (const _ of createChatbot(llm, retriever, undefined, factExtractor).chat(
        'hi',
        's1',
      )) {
      }
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(retriever.addLore).toHaveBeenCalledWith('fact', "User's name is Dave")
      expect(retriever.addLore).toHaveBeenCalledWith('fact', 'User is 30')
    })

    it('does not call addLore when no facts are extracted', async () => {
      vi.mocked(factExtractor.extract).mockResolvedValue([])
      for await (const _ of createChatbot(llm, retriever, undefined, factExtractor).chat(
        'hi',
        's1',
      )) {
      }
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(retriever.addLore).not.toHaveBeenCalled()
    })

    it('does not run fact extraction when no extractor is provided', async () => {
      for await (const _ of createChatbot(llm, retriever).chat('hi', 's1')) {
      }
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(retriever.addLore).not.toHaveBeenCalled()
    })
  })
})
