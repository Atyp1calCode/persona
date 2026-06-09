import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRetriever } from './retriever.js'
import type { VectorStore, MemoryRecord } from './vectorStore.js'
import type { Embedder } from './embedder.js'
import { DEFAULT_TOP_K } from '../constants.js'

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

    it('searches for lore and session history in parallel', async () => {
      await createRetriever(store, embedder).retrieve('query', 'session-1')

      expect(store.search).toHaveBeenCalledTimes(2)
      expect(store.search).toHaveBeenCalledWith(VECTOR, DEFAULT_TOP_K, `type = 'lore'`)
      expect(store.search).toHaveBeenCalledWith(
        VECTOR,
        DEFAULT_TOP_K,
        `type = 'chat' AND "sessionId" = 'session-1'`,
      )
    })

    it('fetches recent history for the session', async () => {
      await createRetriever(store, embedder).retrieve('query', 'session-1')
      expect(store.getRecentBySession).toHaveBeenCalledWith('session-1', DEFAULT_TOP_K)
    })

    it('returns lore and merges semantic + recent history', async () => {
      const loreRecord = makeRecord({ type: 'lore' })
      const chatRecord = makeRecord({
        id: 'c1',
        type: 'chat',
        sessionId: 's1',
        metadata: JSON.stringify({ timestamp: 1000 }),
      })
      vi.mocked(store.search)
        .mockResolvedValueOnce([loreRecord])
        .mockResolvedValueOnce([chatRecord])
      vi.mocked(store.getRecentBySession).mockResolvedValue([chatRecord])

      const result = await createRetriever(store, embedder).retrieve('q', 's1')

      expect(result.lore).toEqual([loreRecord])
      expect(result.history).toEqual([chatRecord])
    })

    it('deduplicates records that appear in both semantic and recent results', async () => {
      const shared = makeRecord({
        id: 'shared',
        type: 'chat',
        sessionId: 's1',
        metadata: JSON.stringify({ timestamp: 2000 }),
      })
      const semanticOnly = makeRecord({
        id: 'sem',
        type: 'chat',
        sessionId: 's1',
        metadata: JSON.stringify({ timestamp: 1000 }),
      })
      vi.mocked(store.search)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([shared, semanticOnly])
      vi.mocked(store.getRecentBySession).mockResolvedValue([shared])

      const result = await createRetriever(store, embedder).retrieve('q', 's1')

      const ids = result.history.map((r) => r.id)
      expect(ids).toContain('shared')
      expect(ids).toContain('sem')
      expect(ids.filter((id) => id === 'shared')).toHaveLength(1)
    })

    it('returns history sorted chronologically by timestamp', async () => {
      const older = makeRecord({
        id: 'old',
        type: 'chat',
        sessionId: 's1',
        metadata: JSON.stringify({ timestamp: 1000 }),
      })
      const newer = makeRecord({
        id: 'new',
        type: 'chat',
        sessionId: 's1',
        metadata: JSON.stringify({ timestamp: 2000 }),
      })
      vi.mocked(store.search).mockResolvedValueOnce([]).mockResolvedValueOnce([newer])
      vi.mocked(store.getRecentBySession).mockResolvedValue([older])

      const result = await createRetriever(store, embedder).retrieve('q', 's1')

      expect(result.history.map((r) => r.id)).toEqual(['old', 'new'])
    })

    it('respects a custom topK value', async () => {
      await createRetriever(store, embedder, 10).retrieve('q', 's1')
      expect(store.search).toHaveBeenCalledWith(VECTOR, 10, expect.any(String))
      expect(store.getRecentBySession).toHaveBeenCalledWith(expect.any(String), 10)
    })
  })

  describe('saveExchange()', () => {
    it('embeds the formatted exchange text', async () => {
      await createRetriever(store, embedder).saveExchange('hello', 'hi', 's1')
      expect(embedder.embed).toHaveBeenCalledWith('User: hello\nAssistant: hi')
    })

    it('inserts a chat record with the correct fields', async () => {
      await createRetriever(store, embedder).saveExchange('hello', 'hi', 'session-1')
      expect(store.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          text: 'User: hello\nAssistant: hi',
          type: 'chat',
          sessionId: 'session-1',
        }),
      ])
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
