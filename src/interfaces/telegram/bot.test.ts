import { describe, it, expect, vi } from 'vitest'
import type { Chatbot } from '../../core/chatbot.js'
import type { VectorStore, MemoryRecord } from '../../rag/vectorStore.js'
import { TELEGRAM_THINKING_PLACEHOLDER } from '../../constants.js'

const mockBotInstance = vi.hoisted(() => ({
  on: vi.fn(),
  command: vi.fn(),
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

function makeCtx(chatId: number, userId: number, text = 'Hello') {
  return {
    chat: { id: chatId },
    from: { id: userId },
    message: { text },
    reply: vi.fn().mockResolvedValue({ message_id: 42 }),
    api: { editMessageText: vi.fn().mockResolvedValue(undefined) },
  }
}

function makeCommandCtx(chatId: number, match = '') {
  return {
    chat: { id: chatId },
    match,
    reply: vi.fn().mockResolvedValue(undefined),
  }
}

function getMessageHandler(chatbot: Chatbot, store?: VectorStore, allowedIds?: Set<number>) {
  vi.clearAllMocks()
  createTelegramBot('token', chatbot, store ?? makeStore(), allowedIds)
  return mockBotInstance.on.mock.calls[0][1] as (ctx: ReturnType<typeof makeCtx>) => Promise<void>
}

function getCommandHandler(name: string, store?: VectorStore) {
  vi.clearAllMocks()
  createTelegramBot('token', makeChatbot(), store ?? makeStore())
  const call = mockBotInstance.command.mock.calls.find((args) => args[0] === name)
  return call?.[1] as (ctx: ReturnType<typeof makeCommandCtx>) => Promise<void>
}

describe('createTelegramBot', () => {
  describe('allowlist', () => {
    it('responds to everyone when the allowlist is empty', async () => {
      const ctx = makeCtx(1, 2)
      await getMessageHandler(makeChatbot(), makeStore(), new Set())(ctx)
      expect(ctx.reply).toHaveBeenCalled()
    })

    it('responds to everyone when no allowlist is passed', async () => {
      const ctx = makeCtx(1, 2)
      await getMessageHandler(makeChatbot())(ctx)
      expect(ctx.reply).toHaveBeenCalled()
    })

    it('allows a message from an allowed user ID', async () => {
      const ctx = makeCtx(111, 456)
      await getMessageHandler(makeChatbot(), makeStore(), new Set([456]))(ctx)
      expect(ctx.reply).toHaveBeenCalled()
    })

    it('allows a message from an allowed chat ID', async () => {
      const ctx = makeCtx(-999, 456)
      await getMessageHandler(makeChatbot(), makeStore(), new Set([-999]))(ctx)
      expect(ctx.reply).toHaveBeenCalled()
    })

    it('silently ignores messages from users not in the allowlist', async () => {
      const chatbot = makeChatbot()
      const ctx = makeCtx(111, 222)
      await getMessageHandler(chatbot, makeStore(), new Set([999]))(ctx)
      expect(ctx.reply).not.toHaveBeenCalled()
      expect(chatbot.chat).not.toHaveBeenCalled()
    })
  })

  describe('message handling', () => {
    it('replies with the thinking placeholder while processing', async () => {
      const ctx = makeCtx(1, 2)
      await getMessageHandler(makeChatbot())(ctx)
      expect(ctx.reply).toHaveBeenCalledWith(TELEGRAM_THINKING_PLACEHOLDER)
    })

    it('edits the placeholder with the full response when done', async () => {
      const ctx = makeCtx(123, 456, 'hi')
      await getMessageHandler(makeChatbot(['Hi', ' there']))(ctx)

      const lastCall = ctx.api.editMessageText.mock.calls.at(-1)
      expect(lastCall).toEqual([123, 42, 'Hi there'])
    })

    it('ignores messages that are bot commands', async () => {
      const chatbot = makeChatbot()
      const ctx = {
        ...makeCtx(1, 2, '/clear'),
        message: { text: '/clear', entities: [{ type: 'bot_command', offset: 0, length: 6 }] },
      }
      await getMessageHandler(chatbot)(ctx)
      expect(chatbot.chat).not.toHaveBeenCalled()
    })

    it('uses the chat ID as the session ID by default', async () => {
      const chatbot = makeChatbot()
      const ctx = makeCtx(777, 456, 'hello')
      await getMessageHandler(chatbot)(ctx)
      expect(chatbot.chat).toHaveBeenCalledWith('hello', '777')
    })

    it('registers a message:text event listener', () => {
      vi.clearAllMocks()
      createTelegramBot('token', makeChatbot(), makeStore())
      expect(mockBotInstance.on).toHaveBeenCalledWith('message:text', expect.any(Function))
    })

    it('registers an error handler', () => {
      vi.clearAllMocks()
      createTelegramBot('token', makeChatbot(), makeStore())
      expect(mockBotInstance.catch).toHaveBeenCalled()
    })
  })

  describe('/new command', () => {
    it('switches to a named session', async () => {
      const chatbot = makeChatbot()
      vi.clearAllMocks()
      createTelegramBot('token', chatbot, makeStore())
      const newHandler = mockBotInstance.command.mock.calls.find((args) => args[0] === 'new')?.[1]
      const msgHandler = mockBotInstance.on.mock.calls[0][1]

      const cmdCtx = makeCommandCtx(100, 'work')
      await newHandler(cmdCtx)
      expect(cmdCtx.reply).toHaveBeenCalledWith(expect.stringContaining('"work"'))

      const msgCtx = makeCtx(100, 1, 'hi')
      await msgHandler(msgCtx)
      expect(chatbot.chat).toHaveBeenCalledWith('hi', '100:work')
    })

    it('auto-generates a session name when none is provided', async () => {
      const handler = getCommandHandler('new')
      const ctx = makeCommandCtx(1, '')
      await handler(ctx)
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringMatching(/Started new conversation/))
    })

    it('registers the /new command', () => {
      vi.clearAllMocks()
      createTelegramBot('token', makeChatbot(), makeStore())
      expect(mockBotInstance.command).toHaveBeenCalledWith('new', expect.any(Function))
    })
  })

  describe('/clear command', () => {
    it('deletes the current session from the store', async () => {
      const store = makeStore()
      const handler = getCommandHandler('clear', store)
      const ctx = makeCommandCtx(42)
      await handler(ctx)
      expect(store.deleteBySession).toHaveBeenCalledWith('42')
    })

    it('replies confirming the conversation was cleared', async () => {
      const handler = getCommandHandler('clear')
      const ctx = makeCommandCtx(1)
      await handler(ctx)
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('cleared'))
    })

    it('resets to the default session after clearing', async () => {
      const chatbot = makeChatbot()
      vi.clearAllMocks()
      createTelegramBot('token', chatbot, makeStore())
      const newHandler = mockBotInstance.command.mock.calls.find((args) => args[0] === 'new')?.[1]
      const clearHandler = mockBotInstance.command.mock.calls.find(
        (args) => args[0] === 'clear',
      )?.[1]
      const msgHandler = mockBotInstance.on.mock.calls[0][1]

      await newHandler(makeCommandCtx(5, 'myconv'))
      await clearHandler(makeCommandCtx(5))

      const msgCtx = makeCtx(5, 1, 'hello')
      await msgHandler(msgCtx)
      expect(chatbot.chat).toHaveBeenCalledWith('hello', '5')
    })
  })

  describe('/sessions command', () => {
    it('reports no conversations when history is empty', async () => {
      const handler = getCommandHandler('sessions')
      const ctx = makeCommandCtx(1)
      await handler(ctx)
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('No conversations'))
    })

    it('lists only sessions belonging to the current chat', async () => {
      const record = (sessionId: string): MemoryRecord => ({
        id: '1',
        text: '',
        vector: [],
        type: 'chat',
        sessionId,
        metadata: '{}',
      })
      const store = makeStore({
        listByType: vi.fn().mockResolvedValue([record('10'), record('10:work'), record('99')]),
      })
      const handler = getCommandHandler('sessions', store)
      const ctx = makeCommandCtx(10)
      await handler(ctx)
      const reply: string = ctx.reply.mock.calls[0][0]
      expect(reply).toContain('default')
      expect(reply).toContain('work')
      expect(reply).not.toContain('99')
    })

    it('marks the active session with a checkmark', async () => {
      const store = makeStore({
        listByType: vi
          .fn()
          .mockResolvedValue([
            { id: '1', text: '', vector: [], type: 'chat', sessionId: '7', metadata: '{}' },
          ]),
      })
      const handler = getCommandHandler('sessions', store)
      const ctx = makeCommandCtx(7)
      await handler(ctx)
      expect(ctx.reply.mock.calls[0][0]).toContain('✓')
    })
  })

  describe('/switch command', () => {
    it('replies with usage when no name is given', async () => {
      const handler = getCommandHandler('switch')
      const ctx = makeCommandCtx(1, '')
      await handler(ctx)
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Usage'))
    })

    it('switches to the named session', async () => {
      const chatbot = makeChatbot()
      vi.clearAllMocks()
      createTelegramBot('token', chatbot, makeStore())
      const switchHandler = mockBotInstance.command.mock.calls.find(
        (args) => args[0] === 'switch',
      )?.[1]
      const msgHandler = mockBotInstance.on.mock.calls[0][1]

      await switchHandler(makeCommandCtx(3, 'project'))
      const msgCtx = makeCtx(3, 1, 'hi')
      await msgHandler(msgCtx)
      expect(chatbot.chat).toHaveBeenCalledWith('hi', '3:project')
    })

    it('switches back to the default session when given "default"', async () => {
      const chatbot = makeChatbot()
      vi.clearAllMocks()
      createTelegramBot('token', chatbot, makeStore())
      const newHandler = mockBotInstance.command.mock.calls.find((args) => args[0] === 'new')?.[1]
      const switchHandler = mockBotInstance.command.mock.calls.find(
        (args) => args[0] === 'switch',
      )?.[1]
      const msgHandler = mockBotInstance.on.mock.calls[0][1]

      await newHandler(makeCommandCtx(8, 'temp'))
      await switchHandler(makeCommandCtx(8, 'default'))

      const msgCtx = makeCtx(8, 1, 'hello')
      await msgHandler(msgCtx)
      expect(chatbot.chat).toHaveBeenCalledWith('hello', '8')
    })
  })
})
