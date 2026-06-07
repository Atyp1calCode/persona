import { describe, it, expect, vi } from 'vitest'
import type { Chatbot } from '../../core/chatbot.js'
import { TELEGRAM_THINKING_PLACEHOLDER } from '../../constants.js'

const mockBotInstance = vi.hoisted(() => ({
  on: vi.fn(),
  catch: vi.fn(),
  start: vi.fn(),
}))

vi.mock('grammy', () => ({
  Bot: vi.fn(function () {
    return mockBotInstance
  }),
}))

import { createTelegramBot } from './bot.js'

function makeChatbot(chunks = ['Hi', ' there']): Chatbot {
  return {
    chat: vi.fn().mockImplementation(async function* () {
      for (const c of chunks) yield c
    }),
  }
}

function makeCtx(chatId: number, userId: number, text = 'Hello') {
  return {
    chat: { id: chatId },
    from: { id: userId },
    message: { text },
    reply: vi.fn().mockResolvedValue({ message_id: 42 }),
    api: { editMessageText: vi.fn().mockResolvedValue(undefined) },
  }
}

function getHandler(chatbot: Chatbot, allowedIds?: Set<number>) {
  vi.clearAllMocks()
  createTelegramBot('token', chatbot, allowedIds)
  return mockBotInstance.on.mock.calls[0][1] as (ctx: ReturnType<typeof makeCtx>) => Promise<void>
}

describe('createTelegramBot', () => {
  describe('allowlist', () => {
    it('responds to everyone when the allowlist is empty', async () => {
      const ctx = makeCtx(1, 2)
      await getHandler(makeChatbot(), new Set())(ctx)
      expect(ctx.reply).toHaveBeenCalled()
    })

    it('responds to everyone when no allowlist is passed', async () => {
      const ctx = makeCtx(1, 2)
      await getHandler(makeChatbot())(ctx)
      expect(ctx.reply).toHaveBeenCalled()
    })

    it('allows a message from an allowed user ID', async () => {
      const ctx = makeCtx(111, 456)
      await getHandler(makeChatbot(), new Set([456]))(ctx)
      expect(ctx.reply).toHaveBeenCalled()
    })

    it('allows a message from an allowed chat ID', async () => {
      const ctx = makeCtx(-999, 456)
      await getHandler(makeChatbot(), new Set([-999]))(ctx)
      expect(ctx.reply).toHaveBeenCalled()
    })

    it('silently ignores messages from users not in the allowlist', async () => {
      const chatbot = makeChatbot()
      const ctx = makeCtx(111, 222)
      await getHandler(chatbot, new Set([999]))(ctx)
      expect(ctx.reply).not.toHaveBeenCalled()
      expect(chatbot.chat).not.toHaveBeenCalled()
    })
  })

  describe('message handling', () => {
    it('replies with the thinking placeholder while processing', async () => {
      const ctx = makeCtx(1, 2)
      await getHandler(makeChatbot())(ctx)
      expect(ctx.reply).toHaveBeenCalledWith(TELEGRAM_THINKING_PLACEHOLDER)
    })

    it('edits the placeholder with the full response when done', async () => {
      const ctx = makeCtx(123, 456, 'hi')
      await getHandler(makeChatbot(['Hi', ' there']))(ctx)

      const lastCall = ctx.api.editMessageText.mock.calls.at(-1)
      expect(lastCall).toEqual([123, 42, 'Hi there'])
    })

    it('uses the chat ID as the session ID', async () => {
      const chatbot = makeChatbot()
      const ctx = makeCtx(777, 456, 'hello')
      await getHandler(chatbot)(ctx)
      expect(chatbot.chat).toHaveBeenCalledWith('hello', '777')
    })

    it('registers a message:text event listener', () => {
      vi.clearAllMocks()
      createTelegramBot('token', makeChatbot())
      expect(mockBotInstance.on).toHaveBeenCalledWith('message:text', expect.any(Function))
    })

    it('registers an error handler', () => {
      vi.clearAllMocks()
      createTelegramBot('token', makeChatbot())
      expect(mockBotInstance.catch).toHaveBeenCalled()
    })
  })
})
