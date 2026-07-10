import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createChatbot } from './chatbot.js'
import type { LLMAdapter } from '../adapters/types.js'
import type { Retriever } from '../rag/retriever.js'
import type { MemoryRecord } from '../rag/vectorStore.js'
import type { FactExtractor } from './factExtractor.js'
import {
  DEFAULT_SYSTEM_PROMPT,
  DIALOGUE_STYLE_NOTE,
  CONFIDENTIALITY_NOTE,
  MAX_FACTS_PER_MESSAGE,
  OBSERVED_FACT_MIN_LENGTH,
} from '../constants.js'

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
      retrieve: vi.fn().mockResolvedValue({ lore: [], recall: [], recent: [] }),
      saveExchange: vi.fn().mockResolvedValue(undefined),
      addLore: vi.fn().mockResolvedValue('id'),
      addFact: vi.fn().mockResolvedValue('id'),
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
    expect(retriever.retrieve).toHaveBeenCalledWith('hi', 'session-1', '')
  })

  it('uses the default system prompt when none is provided', async () => {
    for await (const _ of createChatbot(llm, retriever).chat('hi', 's1')) {
    }
    const messages = vi.mocked(llm.chat).mock.calls[0][0]
    expect(messages[0]).toEqual({
      role: 'system',
      content: `${DEFAULT_SYSTEM_PROMPT}\n\n${DIALOGUE_STYLE_NOTE}\n\n${CONFIDENTIALITY_NOTE}`,
    })
  })

  it('uses a custom system prompt when provided', async () => {
    for await (const _ of createChatbot(llm, retriever, 'You are a pirate.').chat('hi', 's1')) {
    }
    const messages = vi.mocked(llm.chat).mock.calls[0][0]
    expect(messages[0].content).toContain('You are a pirate.')
  })

  it('always appends the dialogue style and confidentiality notes to the system prompt', async () => {
    for await (const _ of createChatbot(llm, retriever, 'You are a pirate.').chat('hi', 's1')) {
    }
    const messages = vi.mocked(llm.chat).mock.calls[0][0]
    expect(messages[0].content).toContain(DIALOGUE_STYLE_NOTE)
    expect(messages[0].content).toContain(CONFIDENTIALITY_NOTE)
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
      recall: [],
      recent: [],
    })

    for await (const _ of createChatbot(llm, retriever).chat('tell me', 's1')) {
    }

    const systemContent = vi.mocked(llm.chat).mock.calls[0][0][0].content
    expect(systemContent).toContain('## Background knowledge')
    expect(systemContent).toContain('Dragons exist.')
  })

  it('injects semantic recall into the system prompt as separate background', async () => {
    vi.mocked(retriever.retrieve).mockResolvedValue({
      lore: [],
      recall: [makeRecord('User: where do I live?\nAssistant: Berlin', 'chat')],
      recent: [],
    })

    for await (const _ of createChatbot(llm, retriever).chat('again', 's1')) {
    }

    const systemContent = vi.mocked(llm.chat).mock.calls[0][0][0].content
    expect(systemContent).toContain('## Possibly related earlier messages')
    expect(systemContent).toContain('User: where do I live?\nAssistant: Berlin')
  })

  it('replays recent exchanges as real user/assistant turns', async () => {
    vi.mocked(retriever.retrieve).mockResolvedValue({
      lore: [],
      recall: [],
      recent: [
        { user: 'my name is Dave', assistant: 'Nice to meet you, Dave!' },
        { user: 'I live in Berlin', assistant: 'Got it.' },
      ],
    })

    for await (const _ of createChatbot(llm, retriever).chat('where do I live?', 's1')) {
    }

    const messages = vi.mocked(llm.chat).mock.calls[0][0]
    expect(messages).toEqual([
      { role: 'system', content: expect.any(String) },
      { role: 'user', content: 'my name is Dave' },
      { role: 'assistant', content: 'Nice to meet you, Dave!' },
      { role: 'user', content: 'I live in Berlin' },
      { role: 'assistant', content: 'Got it.' },
      { role: 'user', content: 'where do I live?' },
    ])
  })

  it('adds no context sections to the system prompt when there is no context', async () => {
    for await (const _ of createChatbot(llm, retriever, 'Be helpful.').chat('hi', 's1')) {
    }
    const systemContent = vi.mocked(llm.chat).mock.calls[0][0][0].content
    expect(systemContent).toBe(`Be helpful.\n\n${DIALOGUE_STYLE_NOTE}\n\n${CONFIDENTIALITY_NOTE}`)
  })

  it('saves the full exchange after streaming completes', async () => {
    for await (const _ of createChatbot(llm, retriever).chat('hello', 'session-1')) {
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(retriever.saveExchange).toHaveBeenCalledWith('hello', 'Hello world', 'session-1')
  })

  it('injects operator notes about the speaker into the system prompt', async () => {
    for await (const _ of createChatbot(llm, retriever).chat('hi', 's1', {
      userNotes: ['My neighbour', 'Owns a cat'],
    })) {
    }
    const systemContent = vi.mocked(llm.chat).mock.calls[0][0][0].content
    expect(systemContent).toContain('## Notes about the current speaker')
    expect(systemContent).toContain('My neighbour\nOwns a cat')
  })

  it('layers persona lore onto the system prompt as the character to play', async () => {
    for await (const _ of createChatbot(llm, retriever, 'Base prompt.').chat('hi', 's1', {
      personaLore: ['You are Annabel', 'Sharp-tongued but warm'],
    })) {
    }
    const systemContent = vi.mocked(llm.chat).mock.calls[0][0][0].content
    expect(systemContent).toContain('Base prompt.')
    expect(systemContent).toContain(
      'In this chat you play the following character:\nYou are Annabel\nSharp-tongued but warm',
    )
  })

  it('passes the lore scope to retrieval and fact storage', async () => {
    const factExtractor: FactExtractor = {
      extract: vi.fn().mockResolvedValue(['Alex lives in Berlin']),
    }
    for await (const _ of createChatbot(llm, retriever, undefined, factExtractor).chat(
      'Alex: I live in Berlin',
      's1',
      { loreScope: '-100' },
    )) {
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(retriever.retrieve).toHaveBeenCalledWith('Alex: I live in Berlin', 's1', '-100')
    expect(retriever.addFact).toHaveBeenCalledWith('Alex lives in Berlin', '-100')
  })

  it('replays observed turns (no assistant reply) as lone user messages', async () => {
    vi.mocked(retriever.retrieve).mockResolvedValue({
      lore: [],
      recall: [],
      recent: [
        { user: 'Alex: lunch anyone?', assistant: '' },
        { user: 'Maria: sure!', assistant: '' },
      ],
    })

    for await (const _ of createChatbot(llm, retriever).chat('what did I miss?', 's1')) {
    }

    const messages = vi.mocked(llm.chat).mock.calls[0][0]
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'user', 'user'])
  })

  describe('observe()', () => {
    it('saves the message with an empty assistant reply', async () => {
      await createChatbot(llm, retriever).observe('Alex: hello all', 'group-1')
      expect(retriever.saveExchange).toHaveBeenCalledWith('Alex: hello all', '', 'group-1')
      expect(llm.chat).not.toHaveBeenCalled()
    })

    it('extracts scoped facts from observed messages long enough to carry them', async () => {
      const factExtractor: FactExtractor = {
        extract: vi.fn().mockResolvedValue(['Maria flies to Lisbon on the 20th']),
      }
      const msg = 'Maria: Just booked my flight to Lisbon for the 20th!'
      await createChatbot(llm, retriever, undefined, factExtractor).observe(msg, 'g1', {
        loreScope: '-100',
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(factExtractor.extract).toHaveBeenCalledWith(msg, '')
      expect(retriever.addFact).toHaveBeenCalledWith('Maria flies to Lisbon on the 20th', '-100')
    })

    it('skips fact extraction for short messages', async () => {
      const factExtractor: FactExtractor = { extract: vi.fn().mockResolvedValue([]) }
      const short = 'a'.repeat(OBSERVED_FACT_MIN_LENGTH - 1)
      await createChatbot(llm, retriever, undefined, factExtractor).observe(short, 'g1', {
        loreScope: '-100',
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(factExtractor.extract).not.toHaveBeenCalled()
    })

    it('caps the number of facts stored per message', async () => {
      const manyFacts = Array.from({ length: MAX_FACTS_PER_MESSAGE + 3 }, (_, i) => `fact ${i}`)
      const factExtractor: FactExtractor = { extract: vi.fn().mockResolvedValue(manyFacts) }
      await createChatbot(llm, retriever, undefined, factExtractor).observe(
        'a long enough message with lots of facts',
        'g1',
        { loreScope: '-100' },
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(retriever.addFact).toHaveBeenCalledTimes(MAX_FACTS_PER_MESSAGE)
    })
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
      expect(retriever.addFact).toHaveBeenCalledWith("User's name is Dave", '')
      expect(retriever.addFact).toHaveBeenCalledWith('User is 30', '')
    })

    it('does not store facts when none are extracted', async () => {
      vi.mocked(factExtractor.extract).mockResolvedValue([])
      for await (const _ of createChatbot(llm, retriever, undefined, factExtractor).chat(
        'hi',
        's1',
      )) {
      }
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(retriever.addFact).not.toHaveBeenCalled()
    })

    it('does not run fact extraction when no extractor is provided', async () => {
      for await (const _ of createChatbot(llm, retriever).chat('hi', 's1')) {
      }
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(retriever.addFact).not.toHaveBeenCalled()
    })
  })
})
