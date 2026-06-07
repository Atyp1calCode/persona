import OpenAI from 'openai'
import { DEFAULT_EMBED_MODEL, OLLAMA_BASE_URL, OLLAMA_API_KEY } from '../constants.js'

export interface Embedder {
  model: string
  embed(text: string): Promise<number[]>
  embedBatch(texts: string[]): Promise<number[][]>
}

export function createEmbedder(
  model = DEFAULT_EMBED_MODEL,
  baseUrl = OLLAMA_BASE_URL,
  apiKey = OLLAMA_API_KEY,
): Embedder {
  const client = new OpenAI({ baseURL: baseUrl, apiKey })

  return {
    model,
    async embed(text) {
      const res = await client.embeddings.create({ model, input: text })
      return res.data[0].embedding
    },
    async embedBatch(texts) {
      const res = await client.embeddings.create({ model, input: texts })
      return res.data.map((d) => d.embedding)
    },
  }
}
