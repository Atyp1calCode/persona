import { Bot } from 'grammy'
import type { Chatbot } from '../../core/chatbot.js'
import { TELEGRAM_THINKING_PLACEHOLDER, TELEGRAM_EDIT_INTERVAL_MS } from '../../constants.js'

export function createTelegramBot(
  token: string,
  chatbot: Chatbot,
  allowedIds: Set<number> = new Set(),
) {
  const bot = new Bot(token)

  const isAllowed = (chatId: number, userId: number | undefined) => {
    if (allowedIds.size === 0) return true
    return allowedIds.has(chatId) || (userId !== undefined && allowedIds.has(userId))
  }

  bot.on('message:text', async (ctx) => {
    if (!isAllowed(ctx.chat.id, ctx.from?.id)) return

    const sessionId = String(ctx.chat.id)
    const userMessage = ctx.message.text

    const placeholder = await ctx.reply(TELEGRAM_THINKING_PLACEHOLDER)
    let response = ''
    let lastEdit = Date.now()

    for await (const chunk of chatbot.chat(userMessage, sessionId)) {
      response += chunk
      if (Date.now() - lastEdit > TELEGRAM_EDIT_INTERVAL_MS) {
        await ctx.api.editMessageText(ctx.chat.id, placeholder.message_id, response).catch(() => {})
        lastEdit = Date.now()
      }
    }

    await ctx.api.editMessageText(ctx.chat.id, placeholder.message_id, response).catch(() => {})
  })

  bot.catch((err) => console.error('Bot error:', err))

  return bot
}
