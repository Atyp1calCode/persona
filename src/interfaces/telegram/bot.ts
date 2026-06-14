import { Bot } from 'grammy'
import type { Chatbot } from '../../core/chatbot.js'
import type { VectorStore } from '../../rag/vectorStore.js'
import { createLogger, type Logger } from '../../core/logger.js'
import {
  TELEGRAM_THINKING_PLACEHOLDER,
  TELEGRAM_EDIT_INTERVAL_MS,
  TELEGRAM_MESSAGE_MAX_LENGTH,
  TELEGRAM_EMPTY_RESPONSE,
} from '../../constants.js'

/** Splits text into chunks no longer than `max`, preferring to break on newline boundaries. */
function splitMessage(text: string, max: number): string[] {
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > max) {
    const newlineCut = remaining.lastIndexOf('\n', max)
    const cut = newlineCut > 0 ? newlineCut : max
    chunks.push(remaining.slice(0, cut))
    remaining = remaining.slice(cut).replace(/^\n/, '')
  }
  if (remaining.length > 0) chunks.push(remaining)
  return chunks
}

export function createTelegramBot(
  token: string,
  chatbot: Chatbot,
  store: VectorStore,
  allowedIds: Set<number> = new Set(),
  logger: Logger = createLogger(),
) {
  const bot = new Bot(token)
  const activeSessions = new Map<number, string>()

  const getSession = (chatId: number) => activeSessions.get(chatId) ?? String(chatId)

  const isAllowed = (chatId: number, userId: number | undefined) => {
    if (allowedIds.size === 0) return true
    return allowedIds.has(chatId) || (userId !== undefined && allowedIds.has(userId))
  }

  bot.on('message:text', async (ctx, next) => {
    if (!isAllowed(ctx.chat.id, ctx.from?.id)) return
    if (ctx.message.entities?.some((e) => e.type === 'bot_command')) return next()

    const sessionId = getSession(ctx.chat.id)
    const userMessage = ctx.message.text

    const placeholder = await ctx.reply(TELEGRAM_THINKING_PLACEHOLDER)
    let response = ''
    let lastEdit = Date.now()

    for await (const chunk of chatbot.chat(userMessage, sessionId)) {
      response += chunk
      // Only live-edit while the response still fits in one message; longer output is split below.
      if (
        Date.now() - lastEdit > TELEGRAM_EDIT_INTERVAL_MS &&
        response.length <= TELEGRAM_MESSAGE_MAX_LENGTH
      ) {
        await ctx.api.editMessageText(ctx.chat.id, placeholder.message_id, response).catch(() => {})
        lastEdit = Date.now()
      }
    }

    const chunks = response.trim()
      ? splitMessage(response, TELEGRAM_MESSAGE_MAX_LENGTH)
      : [TELEGRAM_EMPTY_RESPONSE]
    await ctx.api.editMessageText(ctx.chat.id, placeholder.message_id, chunks[0]).catch(() => {})
    for (const chunk of chunks.slice(1)) {
      await ctx.reply(chunk).catch(() => {})
    }
  })

  bot.command('new', async (ctx) => {
    const chatId = ctx.chat.id
    const name = ctx.match?.trim() || String(Date.now())
    const sessionId = `${chatId}:${name}`
    activeSessions.set(chatId, sessionId)
    await ctx.reply(`Started new conversation: "${name}"`)
  })

  bot.command('clear', async (ctx) => {
    const chatId = ctx.chat.id
    const sessionId = getSession(chatId)
    await store.deleteBySession(sessionId)
    activeSessions.delete(chatId)
    await ctx.reply('Conversation cleared. Starting fresh.')
  })

  bot.command('sessions', async (ctx) => {
    const chatId = ctx.chat.id
    const prefix = String(chatId)
    const all = await store.listByType('chat')
    const ids = [...new Set(all.map((r) => r.sessionId))].filter(
      (id) => id === prefix || id.startsWith(`${prefix}:`),
    )
    if (ids.length === 0) {
      await ctx.reply('No conversations found.')
      return
    }
    const current = getSession(chatId)
    const lines = ids.map((id) => {
      const label = id === prefix ? 'default' : id.slice(prefix.length + 1)
      return `• ${label}${id === current ? ' ✓' : ''}`
    })
    await ctx.reply(`Your conversations:\n${lines.join('\n')}\n\nUse /switch <name> to switch.`)
  })

  bot.command('switch', async (ctx) => {
    const chatId = ctx.chat.id
    const name = ctx.match?.trim()
    if (!name) {
      await ctx.reply('Usage: /switch <name> (or /switch default)')
      return
    }
    const sessionId = name === 'default' ? String(chatId) : `${chatId}:${name}`
    activeSessions.set(chatId, sessionId)
    await ctx.reply(`Switched to conversation: "${name}"`)
  })

  bot.catch((err) => logger.error('telegram: unhandled bot error', err))

  return bot
}
