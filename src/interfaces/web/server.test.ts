import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { createWebServer } from './server.js'
import type { Chatbot } from '../../core/chatbot.js'
import type { Retriever } from '../../rag/retriever.js'
import type { VectorStore } from '../../rag/vectorStore.js'

function makeStore(overrides: Partial<VectorStore> = {}): VectorStore {
  return {
    insert: vi.fn().mockResolvedValue(['id']),
    search: vi.fn().mockResolvedValue([]),
    listByType: vi.fn().mockResolvedValue([]),
    getRecentBySession: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    deleteBySession: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as VectorStore
}

function makeRetriever(overrides: Partial<Retriever> = {}): Retriever {
  return {
    retrieve: vi.fn().mockResolvedValue({ lore: [], history: [] }),
    saveExchange: vi.fn().mockResolvedValue(undefined),
    addLore: vi.fn().mockResolvedValue('new-lore-id'),
    ...overrides,
  }
}

function makeChatbot(chunks = ['Hello']): Chatbot {
  return {
    chat: vi.fn().mockImplementation(async function* () {
      for (const c of chunks) yield c
    }),
  }
}

async function collectSSE(res: request.Response): Promise<string> {
  // supertest buffers the full response body in res.text for text/* content types
  return res.text
}

describe('createWebServer', () => {
  describe('GET /api/lore', () => {
    it('returns an empty array when there is no lore', async () => {
      const app = createWebServer(makeChatbot(), makeRetriever(), makeStore())
      const res = await request(app).get('/api/lore')
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('returns lore records with metadata merged in', async () => {
      const store = makeStore({
        listByType: vi.fn().mockResolvedValue([
          {
            id: 'l1',
            text: 'some lore',
            vector: [],
            type: 'lore',
            sessionId: '',
            metadata: JSON.stringify({ name: 'World' }),
          },
        ]),
      })
      const res = await request(createWebServer(makeChatbot(), makeRetriever(), store)).get(
        '/api/lore',
      )
      expect(res.status).toBe(200)
      expect(res.body).toEqual([{ id: 'l1', text: 'some lore', name: 'World' }])
    })
  })

  describe('POST /api/lore', () => {
    it('adds lore via the retriever and returns the new id', async () => {
      const retriever = makeRetriever()
      const res = await request(createWebServer(makeChatbot(), retriever, makeStore()))
        .post('/api/lore')
        .send({ name: 'World', content: 'The world is round.' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: 'new-lore-id' })
      expect(retriever.addLore).toHaveBeenCalledWith('World', 'The world is round.')
    })
  })

  describe('DELETE /api/lore/:id', () => {
    it('deletes the record and returns ok', async () => {
      const store = makeStore()
      const res = await request(createWebServer(makeChatbot(), makeRetriever(), store)).delete(
        '/api/lore/abc-123',
      )

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
      expect(store.delete).toHaveBeenCalledWith('abc-123')
    })
  })

  describe('GET /api/history', () => {
    it('returns an empty array when there are no chat records', async () => {
      const res = await request(createWebServer(makeChatbot(), makeRetriever(), makeStore())).get(
        '/api/history',
      )
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('groups records by sessionId and counts exchanges', async () => {
      const store = makeStore({
        listByType: vi.fn().mockResolvedValue([
          {
            id: '1',
            text: 'a',
            vector: [],
            type: 'chat',
            sessionId: 's1',
            metadata: JSON.stringify({ timestamp: 1000 }),
          },
          {
            id: '2',
            text: 'b',
            vector: [],
            type: 'chat',
            sessionId: 's1',
            metadata: JSON.stringify({ timestamp: 2000 }),
          },
          {
            id: '3',
            text: 'c',
            vector: [],
            type: 'chat',
            sessionId: 's2',
            metadata: JSON.stringify({ timestamp: 500 }),
          },
        ]),
      })
      const res = await request(createWebServer(makeChatbot(), makeRetriever(), store)).get(
        '/api/history',
      )
      expect(res.status).toBe(200)
      expect(res.body).toEqual([
        { sessionId: 's1', exchanges: 2, lastActivity: 2000 },
        { sessionId: 's2', exchanges: 1, lastActivity: 500 },
      ])
    })
  })

  describe('DELETE /api/history/:sessionId', () => {
    it('deletes all records for the session and returns ok', async () => {
      const store = makeStore()
      const res = await request(createWebServer(makeChatbot(), makeRetriever(), store)).delete(
        '/api/history/my-session',
      )
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
      expect(store.deleteBySession).toHaveBeenCalledWith('my-session')
    })
  })

  describe('POST /api/chat', () => {
    it('responds with SSE content-type', async () => {
      const res = await request(createWebServer(makeChatbot(), makeRetriever(), makeStore()))
        .post('/api/chat')
        .send({ message: 'hello', sessionId: 'test' })

      expect(res.headers['content-type']).toMatch(/text\/event-stream/)
    })

    it('streams chunk events followed by a done event', async () => {
      const app = createWebServer(makeChatbot(['Hi', ' there']), makeRetriever(), makeStore())
      const res = await request(app).post('/api/chat').send({ message: 'hello', sessionId: 'test' })

      const body = await collectSSE(res)
      expect(body).toContain('data: {"chunk":"Hi"}')
      expect(body).toContain('data: {"chunk":" there"}')
      expect(body).toContain('"done":true')
    })

    it('includes the sessionId in the done event', async () => {
      const res = await request(createWebServer(makeChatbot(), makeRetriever(), makeStore()))
        .post('/api/chat')
        .send({ message: 'hello', sessionId: 'my-session' })

      expect(await collectSSE(res)).toContain('"sessionId":"my-session"')
    })

    it('generates a sessionId when none is provided', async () => {
      const res = await request(createWebServer(makeChatbot(), makeRetriever(), makeStore()))
        .post('/api/chat')
        .send({ message: 'hello' })

      expect(await collectSSE(res)).toMatch(/"sessionId":"[0-9a-f-]+"/)
    })

    it('returns 400 when message is missing', async () => {
      const res = await request(createWebServer(makeChatbot(), makeRetriever(), makeStore()))
        .post('/api/chat')
        .send({ sessionId: 's1' })

      expect(res.status).toBe(400)
    })

    it('returns 400 when message is empty', async () => {
      const res = await request(createWebServer(makeChatbot(), makeRetriever(), makeStore()))
        .post('/api/chat')
        .send({ message: '   ', sessionId: 's1' })

      expect(res.status).toBe(400)
    })

    it('sends an error event when the chatbot throws', async () => {
      const chatbot: Chatbot = {
        chat: vi.fn().mockImplementation(async function* () {
          throw new Error('LLM failed')
        }),
      }

      const res = await request(createWebServer(chatbot, makeRetriever(), makeStore()))
        .post('/api/chat')
        .send({ message: 'hello', sessionId: 's1' })

      expect(await collectSSE(res)).toContain('"error"')
    })
  })
})
