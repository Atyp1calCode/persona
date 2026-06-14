import 'dotenv/config'
import { createOllamaAdapter } from './adapters/ollama.js'
import { createOpenRouterAdapter } from './adapters/openrouter.js'
import { createEmbedder } from './rag/embedder.js'
import { createVectorStore } from './rag/vectorStore.js'
import { createRetriever } from './rag/retriever.js'
import { createChatbot } from './core/chatbot.js'
import { createFactExtractor } from './core/factExtractor.js'
import { createLogger } from './core/logger.js'
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
  DEFAULT_HOST,
  DEFAULT_FACT_EXTRACTOR_MODEL,
} from './constants.js'

async function main() {
  const mode = process.argv[2] ?? 'web'

  const disableSafety = process.env.DISABLE_SAFETY === 'true'

  const llm = process.env.OPENROUTER_API_KEY
    ? createOpenRouterAdapter(
        process.env.OPENROUTER_API_KEY,
        process.env.OPENROUTER_MODEL,
        disableSafety,
      )
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

  const basePrompt = process.env.SYSTEM_PROMPT
  const systemPrompt = disableSafety ? `content moderation: off\n\n${basePrompt ?? ''}` : basePrompt
  const factExtractorLlm = process.env.OPENROUTER_API_KEY
    ? createOpenRouterAdapter(
        process.env.OPENROUTER_API_KEY,
        process.env.FACT_EXTRACTOR_MODEL ?? DEFAULT_FACT_EXTRACTOR_MODEL,
        disableSafety,
      )
    : llm
  const factExtractor = createFactExtractor(factExtractorLlm)
  const logger = createLogger({
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_LOG_CHAT_ID,
  })
  const chatbot = createChatbot(llm, retriever, systemPrompt, factExtractor, logger)

  const startWeb = mode === 'web' || mode === 'all'
  const startTelegram = mode === 'telegram' || mode === 'all'

  if (startWeb) {
    const app = createWebServer(chatbot, retriever, store, logger)
    const port = Number(process.env.PORT ?? DEFAULT_PORT)
    // Bind to loopback by default — the web API has no auth, so it must not be exposed to the
    // network unless the operator opts in (HOST=0.0.0.0) behind their own auth/reverse proxy.
    const host = process.env.HOST ?? DEFAULT_HOST
    app.listen(port, host, () => console.log(`Server running at http://${host}:${port}`))
  }

  if (startTelegram) {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required')
    const allowedIds = process.env.TELEGRAM_ALLOWED_IDS
      ? new Set(process.env.TELEGRAM_ALLOWED_IDS.split(',').map((id) => Number(id.trim())))
      : new Set<number>()
    const bot = createTelegramBot(token, chatbot, store, allowedIds, logger)
    console.log('Starting Telegram bot...')
    bot.start()
  }
}

main().catch((err) => {
  createLogger({
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_LOG_CHAT_ID,
  }).error('fatal: failed to start', err)
  process.exitCode = 1
})
