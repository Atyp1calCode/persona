import type { Embedder } from './embedder.js'
import type { MemoryRecord, VectorStore } from './vectorStore.js'
import { chatSessionFilter } from './filters.js'
import {
  DEFAULT_RECENT_TURNS,
  DEFAULT_RECALL_LIMIT,
  DEFAULT_LORE_LIMIT,
  DEFAULT_RELEVANCE_MAX_DISTANCE,
} from '../constants.js'

export interface Turn {
  user: string
  assistant: string
}

export interface RetrievedContext {
  /** Background facts relevant to the current message. */
  lore: MemoryRecord[]
  /** Older exchanges semantically similar to the current message (excludes the recent window). */
  recall: MemoryRecord[]
  /** The most recent exchanges, oldest-first, to be replayed as real conversation turns. */
  recent: Turn[]
}

export interface RetrieverOptions {
  recentTurns?: number
  recallLimit?: number
  loreLimit?: number
  maxDistance?: number
}

export interface Retriever {
  retrieve(query: string, sessionId: string): Promise<RetrievedContext>
  saveExchange(userMsg: string, assistantMsg: string, sessionId: string): Promise<void>
  addLore(name: string, content: string): Promise<string>
}

function parseExchange(record: MemoryRecord): Turn {
  const meta = JSON.parse(record.metadata) as { user?: string; assistant?: string }
  if (typeof meta.user === 'string' && typeof meta.assistant === 'string') {
    return { user: meta.user, assistant: meta.assistant }
  }
  // Fallback for exchanges saved before user/assistant were stored in metadata.
  const match = /^User: ([\s\S]*?)\nAssistant: ([\s\S]*)$/.exec(record.text)
  return match ? { user: match[1], assistant: match[2] } : { user: '', assistant: record.text }
}

export function createRetriever(
  store: VectorStore,
  embedder: Embedder,
  options: RetrieverOptions = {},
): Retriever {
  const {
    recentTurns = DEFAULT_RECENT_TURNS,
    recallLimit = DEFAULT_RECALL_LIMIT,
    loreLimit = DEFAULT_LORE_LIMIT,
    maxDistance = DEFAULT_RELEVANCE_MAX_DISTANCE,
  } = options

  const isRelevant = (r: MemoryRecord) => r.distance === undefined || r.distance <= maxDistance

  return {
    async retrieve(query, sessionId) {
      const vector = await embedder.embed(query)
      const [lore, semantic, recentRecords] = await Promise.all([
        store.search(vector, loreLimit, `type = 'lore'`),
        // Over-fetch so that, after removing the recent window, recallLimit older matches remain.
        store.search(vector, recallLimit + recentTurns, chatSessionFilter(sessionId)),
        store.getRecentBySession(sessionId, recentTurns),
      ])

      const recentIds = new Set(recentRecords.map((r) => r.id))
      const recall = semantic
        .filter((r) => !recentIds.has(r.id))
        .filter(isRelevant)
        .slice(0, recallLimit)

      return {
        lore: lore.filter(isRelevant),
        recall,
        recent: recentRecords.map(parseExchange),
      }
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
          // user/assistant are stored separately so recent turns can be replayed as real messages.
          metadata: JSON.stringify({
            timestamp: Date.now(),
            user: userMsg,
            assistant: assistantMsg,
          }),
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
