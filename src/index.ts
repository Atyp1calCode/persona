import 'dotenv/config'
import { createOllamaAdapter } from './adapters/ollama.js'
import { createOpenRouterAdapter } from './adapters/openrouter.js'
import { createEmbedder } from './rag/embedder.js'
import { createVectorStore } from './rag/vectorStore.js'
import { createRetriever } from './rag/retriever.js'
import { createChatbot } from './core/chatbot.js'
import { createWebServer } from './interfaces/web/server.js'
import { createTelegramBot } from './interfaces/telegram/bot.js'
import {
  DEFAULT_EMBED_MODEL,
  DEFAULT_OPENAI_EMBED_MODEL,
  OLLAMA_BASE_URL,
  OLLAMA_API_KEY,
  OPENAI_BASE_URL,
  DEFAULT_LANCEDB_PATH,
  DEFAULT_PORT,
} from './constants.js'

async function main() {
  const mode = process.argv[2] ?? 'web'

  const llm = process.env.OPENROUTER_API_KEY
    ? createOpenRouterAdapter(process.env.OPENROUTER_API_KEY, process.env.OPENROUTER_MODEL)
    : createOllamaAdapter(process.env.OLLAMA_URL, process.env.OLLAMA_MODEL)

  const usingOpenRouter = Boolean(process.env.OPENROUTER_API_KEY)
  const embedBaseUrl =
    process.env.EMBED_BASE_URL ?? (usingOpenRouter ? OPENAI_BASE_URL : OLLAMA_BASE_URL)
  const embedApiKey =
    process.env.EMBED_API_KEY ??
    (usingOpenRouter ? (process.env.OPENAI_API_KEY ?? '') : OLLAMA_API_KEY)
  const embedModel =
    process.env.EMBED_MODEL ?? (usingOpenRouter ? DEFAULT_OPENAI_EMBED_MODEL : DEFAULT_EMBED_MODEL)

  const embedder = createEmbedder(embedModel, embedBaseUrl, embedApiKey)

  const store = await createVectorStore(process.env.LANCEDB_PATH ?? DEFAULT_LANCEDB_PATH)
  const retriever = createRetriever(store, embedder)
  const chatbot = createChatbot(llm, retriever, process.env.SYSTEM_PROMPT)

  if (mode === 'telegram') {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required')
    const allowedIds = process.env.TELEGRAM_ALLOWED_IDS
      ? new Set(process.env.TELEGRAM_ALLOWED_IDS.split(',').map((id) => Number(id.trim())))
      : new Set<number>()
    const bot = createTelegramBot(token, chatbot, allowedIds)
    console.log('Starting Telegram bot...')
    bot.start()
  } else {
    const app = createWebServer(chatbot, retriever, store)
    const port = Number(process.env.PORT ?? DEFAULT_PORT)
    app.listen(port, () => console.log(`Server running at http://localhost:${port}`))
  }
}

main().catch(console.error)
