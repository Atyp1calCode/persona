import { describe, it, expect, vi } from 'vitest'
import { createLogger } from './logger.js'

function makeDeps(overrides: Partial<Parameters<typeof createLogger>[0]> = {}) {
  const con = { error: vi.fn() }
  const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response)
  return {
    con,
    fetchFn,
    deps: { botToken: 'TOKEN', chatId: '-100123', fetchFn, console: con, ...overrides },
  }
}

describe('createLogger', () => {
  describe('error()', () => {
    it('logs the context and error to the console', () => {
      const { con, deps } = makeDeps()
      createLogger(deps).error('factExtractor failed', new Error('boom'))
      expect(con.error).toHaveBeenCalledWith(expect.stringContaining('factExtractor failed'))
      expect(con.error).toHaveBeenCalledWith(expect.stringContaining('boom'))
    })

    it('sends the error to the Telegram chat when configured', () => {
      const { fetchFn, deps } = makeDeps()
      createLogger(deps).error('ctx', new Error('kaboom'))
      expect(fetchFn).toHaveBeenCalledOnce()
      const [url, init] = fetchFn.mock.calls[0]
      expect(url).toBe('https://api.telegram.org/botTOKEN/sendMessage')
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body.chat_id).toBe('-100123')
      expect(body.text).toContain('kaboom')
    })

    it('does not call Telegram when no chatId is configured', () => {
      const { fetchFn, deps } = makeDeps({ chatId: undefined })
      createLogger(deps).error('ctx', new Error('x'))
      expect(fetchFn).not.toHaveBeenCalled()
    })

    it('does not call Telegram when no botToken is configured', () => {
      const { fetchFn, deps } = makeDeps({ botToken: undefined })
      createLogger(deps).error('ctx', new Error('x'))
      expect(fetchFn).not.toHaveBeenCalled()
    })

    it('truncates very long messages before sending', () => {
      const { fetchFn, deps } = makeDeps()
      createLogger(deps).error('ctx', 'x'.repeat(5000))
      const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string)
      expect(body.text.length).toBeLessThanOrEqual(4000)
    })

    it('handles non-Error values', () => {
      const { fetchFn, deps } = makeDeps()
      createLogger(deps).error('ctx', 'plain string failure')
      const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string)
      expect(body.text).toContain('plain string failure')
    })

    it('reports a non-ok Telegram response without throwing', async () => {
      const { con, fetchFn, deps } = makeDeps()
      fetchFn.mockResolvedValue({ ok: false, status: 429 } as Response)
      expect(() => createLogger(deps).error('ctx', new Error('x'))).not.toThrow()
      await Promise.resolve()
      expect(con.error).toHaveBeenCalledWith(expect.stringContaining('429'))
    })

    it('swallows a thrown Telegram delivery without throwing', async () => {
      const { con, fetchFn, deps } = makeDeps()
      fetchFn.mockRejectedValue(new Error('network down'))
      expect(() => createLogger(deps).error('ctx', new Error('x'))).not.toThrow()
      await Promise.resolve()
      await Promise.resolve()
      expect(con.error).toHaveBeenCalledWith(
        expect.stringContaining('Telegram delivery threw'),
        expect.any(Error),
      )
    })
  })
})
