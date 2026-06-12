import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRetriever } from './retriever.js'
import type { VectorStore, MemoryRecord } from './vectorStore.js'
import type { Embedder } from './embedder.js'
import { DEFAULT_RECENT_TURNS, DEFAULT_RECALL_LIMIT, DEFAULT_LORE_LIMIT } from '../constants.js'

const VECTOR = [0.1, 0.2, 0.3]

function makeRecord(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: 'id',
    text: 'text',
    vector: VECTOR,
    type: 'lore',
    sessionId: '',
    metadata: '{}',
    ...overrides,
  }
}

function makeExchange(
  overrides: Partial<MemoryRecord> & { user?: string; assistant?: string } = {},
) {
  const { user = 'hello', assistant = 'hi', ...rest } = overrides
  return makeRecord({
    type: 'chat',
    sessionId: 's1',
    text: `User: ${user}\nAssistant: ${assistant}`,
    metadata: JSON.stringify({ timestamp: 1000, user, assistant }),
    ...rest,
  })
}

describe('createRetriever', () => {
  let store: VectorStore
  let embedder: Embedder

  beforeEach(() => {
    store = {
      insert: vi.fn().mockResolvedValue(['new-id']),
      search: vi.fn().mockResolvedValue([]),
      listByType: vi.fn().mockResolvedValue([]),
      getRecentBySession: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
      deleteBySession: vi.fn().mockResolvedValue(undefined),
    }
    embedder = {
      model: 'test-model',
      embed: vi.fn().mockResolvedValue(VECTOR),
      embedBatch: vi.fn().mockResolvedValue([VECTOR]),
    }
  })

  describe('retrieve()', () => {
    it('embeds the query before searching', async () => {
      await createRetriever(store, embedder).retrieve('what is X?', 's1')
      expect(embedder.embed).toHaveBeenCalledWith('what is X?')
    })

    it('searches lore and session history with their respective limits', async () => {
      await createRetriever(store, embedder).retrieve('query', 'session-1')

      expect(store.search).toHaveBeenCalledWith(VECTOR, DEFAULT_LORE_LIMIT, `type = 'lore'`)
      // Over-fetches recall so the recent window can be removed without starving recall.
      expect(store.search).toHaveBeenCalledWith(
        VECTOR,
        DEFAULT_RECALL_LIMIT + DEFAULT_RECENT_TURNS,
        `type = 'chat' AND "sessionId" = 'session-1'`,
      )
    })

    it('fetches the recent window for the session', async () => {
      await createRetriever(store, embedder).retrieve('query', 'session-1')
      expect(store.getRecentBySession).toHaveBeenCalledWith('session-1', DEFAULT_RECENT_TURNS)
    })

    it('returns lore, semantic recall, and recent turns separately', async () => {
      const lore = makeRecord({ type: 'lore', text: 'fact' })
      const older = makeExchange({ id: 'old', user: 'where do I live?', assistant: 'Berlin' })
      const recent = makeExchange({ id: 'r1', user: 'hi again', assistant: 'hello!' })
      vi.mocked(store.search).mockResolvedValueOnce([lore]).mockResolvedValueOnce([older])
      vi.mocked(store.getRecentBySession).mockResolvedValue([recent])

      const result = await createRetriever(store, embedder).retrieve('q', 's1')

      expect(result.lore).toEqual([lore])
      expect(result.recall).toEqual([older])
      expect(result.recent).toEqual([{ user: 'hi again', assistant: 'hello!' }])
    })

    it('excludes the recent window from semantic recall', async () => {
      const shared = makeExchange({ id: 'shared' })
      const olderOnly = makeExchange({ id: 'older' })
      vi.mocked(store.search).mockResolvedValueOnce([]).mockResolvedValueOnce([shared, olderOnly])
      vi.mocked(store.getRecentBySession).mockResolvedValue([shared])

      const result = await createRetriever(store, embedder).retrieve('q', 's1')

      expect(result.recall.map((r) => r.id)).toEqual(['older'])
    })

    it('drops lore and recall whose distance exceeds the threshold', async () => {
      const near = makeRecord({ id: 'near', type: 'lore', distance: 0.2 })
      const far = makeRecord({ id: 'far', type: 'lore', distance: 0.9 })
      const farRecall = makeExchange({ id: 'farRecall', distance: 0.95 })
      vi.mocked(store.search).mockResolvedValueOnce([near, far]).mockResolvedValueOnce([farRecall])

      const result = await createRetriever(store, embedder).retrieve('q', 's1')

      expect(result.lore.map((r) => r.id)).toEqual(['near'])
      expect(result.recall).toEqual([])
    })

    it('reconstructs recent turns from combined text when metadata lacks user/assistant', async () => {
      const legacy = makeRecord({
        id: 'legacy',
        type: 'chat',
        sessionId: 's1',
        text: 'User: my name is Dave\nAssistant: nice to meet you',
        metadata: JSON.stringify({ timestamp: 1000 }),
      })
      vi.mocked(store.getRecentBySession).mockResolvedValue([legacy])

      const result = await createRetriever(store, embedder).retrieve('q', 's1')

      expect(result.recent).toEqual([{ user: 'my name is Dave', assistant: 'nice to meet you' }])
    })

    it('respects custom retrieval limits', async () => {
      await createRetriever(store, embedder, {
        recentTurns: 2,
        recallLimit: 1,
        loreLimit: 4,
      }).retrieve('q', 's1')

      expect(store.search).toHaveBeenCalledWith(VECTOR, 4, `type = 'lore'`)
      expect(store.search).toHaveBeenCalledWith(VECTOR, 3, expect.stringContaining('chat'))
      expect(store.getRecentBySession).toHaveBeenCalledWith('s1', 2)
    })
  })

  describe('saveExchange()', () => {
    it('embeds the formatted exchange text', async () => {
      await createRetriever(store, embedder).saveExchange('hello', 'hi', 's1')
      expect(embedder.embed).toHaveBeenCalledWith('User: hello\nAssistant: hi')
    })

    it('inserts a chat record with user and assistant in metadata', async () => {
      await createRetriever(store, embedder).saveExchange('hello', 'hi', 'session-1')
      const [record] = vi.mocked(store.insert).mock.calls[0][0]
      expect(record).toMatchObject({
        text: 'User: hello\nAssistant: hi',
        type: 'chat',
        sessionId: 'session-1',
      })
      expect(JSON.parse(record.metadata)).toMatchObject({ user: 'hello', assistant: 'hi' })
    })
  })

  describe('addLore()', () => {
    it('embeds the lore content', async () => {
      await createRetriever(store, embedder).addLore('World', 'The world is flat.')
      expect(embedder.embed).toHaveBeenCalledWith('The world is flat.')
    })

    it('inserts a lore record with name in metadata', async () => {
      await createRetriever(store, embedder).addLore('World', 'The world is flat.')
      expect(store.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          text: 'The world is flat.',
          type: 'lore',
          sessionId: '',
          metadata: JSON.stringify({ name: 'World' }),
        }),
      ])
    })

    it('returns the ID of the inserted record', async () => {
      vi.mocked(store.insert).mockResolvedValue(['lore-id'])
      const id = await createRetriever(store, embedder).addLore('X', 'content')
      expect(id).toBe('lore-id')
    })
  })
})
