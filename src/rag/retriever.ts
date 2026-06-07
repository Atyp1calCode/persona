import type { Embedder } from './embedder.js'
import type { MemoryRecord, VectorStore } from './vectorStore.js'
import { DEFAULT_TOP_K } from '../constants.js'

export interface RetrievedContext {
  lore: MemoryRecord[]
  history: MemoryRecord[]
}

export interface Retriever {
  retrieve(query: string, sessionId: string): Promise<RetrievedContext>
  saveExchange(userMsg: string, assistantMsg: string, sessionId: string): Promise<void>
  addLore(name: string, content: string): Promise<string>
}

export function createRetriever(
  store: VectorStore,
  embedder: Embedder,
  topK = DEFAULT_TOP_K,
): Retriever {
  return {
    async retrieve(query, sessionId) {
      const vector = await embedder.embed(query)
      const [lore, history] = await Promise.all([
        store.search(vector, topK, `type = 'lore'`),
        store.search(vector, topK, `type = 'chat' AND "sessionId" = '${sessionId}'`),
      ])
      return { lore, history }
    },

    async saveExchange(userMsg, assistantMsg, sessionId) {
      const text = `User: ${userMsg}\nAssistant: ${assistantMsg}`
      const vector = await embedder.embed(text)
      await store.insert([
        {
          text,
          vector,
          type: 'chat',
          sessionId,
          metadata: JSON.stringify({ timestamp: Date.now() }),
        },
      ])
    },

    async addLore(name, content) {
      const vector = await embedder.embed(content)
      const [id] = await store.insert([
        { text: content, vector, type: 'lore', sessionId: '', metadata: JSON.stringify({ name }) },
      ])
      return id
    },
  }
}
